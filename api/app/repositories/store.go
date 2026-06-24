package repositories

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (s *Store) EnsureAdminUser(ctx context.Context, email, passwordHash string) error {
	_, err := s.db.Exec(ctx, `
INSERT INTO auth.users (email, display_name, password_hash, role_id, is_active, is_whitelisted)
SELECT $1, 'Base Admin', $2, roles.id, true, true
FROM auth.roles
WHERE roles.name = 'admin'
ON CONFLICT (email) DO UPDATE
SET role_id = EXCLUDED.role_id,
    password_hash = EXCLUDED.password_hash,
    is_active = true,
    is_whitelisted = true,
    updated_at = now()
`, email, passwordHash)
	if err != nil {
		return fmt.Errorf("ensure admin user: %w", err)
	}

	return nil
}

func (s *Store) FindUserByEmail(ctx context.Context, email string) (models.User, string, error) {
	row := s.db.QueryRow(ctx, `
SELECT users.id::text, users.email, users.display_name, users.password_hash, roles.name, users.is_active, users.is_whitelisted, users.created_at
FROM auth.users
JOIN auth.roles ON roles.id = users.role_id
WHERE users.email = $1
`, email)

	var user models.User
	var passwordHash string
	if err := row.Scan(&user.ID, &user.Email, &user.DisplayName, &passwordHash, &user.Role, &user.IsActive, &user.IsWhitelisted, &user.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.User{}, "", ErrNotFound
		}
		return models.User{}, "", fmt.Errorf("find user by email: %w", err)
	}

	return user, passwordHash, nil
}

func (s *Store) FindUserByID(ctx context.Context, id string) (models.User, error) {
	row := s.db.QueryRow(ctx, `
SELECT users.id::text, users.email, users.display_name, roles.name, users.is_active, users.is_whitelisted, users.created_at
FROM auth.users
JOIN auth.roles ON roles.id = users.role_id
WHERE users.id = $1
`, id)

	var user models.User
	if err := row.Scan(&user.ID, &user.Email, &user.DisplayName, &user.Role, &user.IsActive, &user.IsWhitelisted, &user.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.User{}, ErrNotFound
		}
		return models.User{}, fmt.Errorf("find user by id: %w", err)
	}

	return user, nil
}

func (s *Store) ListUsers(ctx context.Context) ([]models.User, error) {
	rows, err := s.db.Query(ctx, `
SELECT users.id::text, users.email, users.display_name, roles.name, users.is_active, users.is_whitelisted, users.created_at
FROM auth.users
JOIN auth.roles ON roles.id = users.role_id
ORDER BY users.created_at DESC
`)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var user models.User
		if err := rows.Scan(&user.ID, &user.Email, &user.DisplayName, &user.Role, &user.IsActive, &user.IsWhitelisted, &user.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, user)
	}

	return users, rows.Err()
}

func (s *Store) UpdateUserRole(ctx context.Context, userID, role string) (models.User, error) {
	_, err := s.db.Exec(ctx, `
UPDATE auth.users
SET role_id = roles.id, updated_at = now()
FROM auth.roles
WHERE auth.users.id = $1 AND roles.name = $2
`, userID, role)
	if err != nil {
		return models.User{}, fmt.Errorf("update user role: %w", err)
	}

	return s.FindUserByID(ctx, userID)
}

func (s *Store) SaveRefreshToken(ctx context.Context, userID, tokenHash string, expiresAt time.Time) error {
	_, err := s.db.Exec(ctx, `
INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
`, userID, tokenHash, expiresAt)
	if err != nil {
		return fmt.Errorf("save refresh token: %w", err)
	}

	return nil
}

func (s *Store) RotateRefreshToken(ctx context.Context, oldHash, newHash string, expiresAt time.Time) (models.User, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return models.User{}, fmt.Errorf("begin refresh rotation: %w", err)
	}
	defer tx.Rollback(ctx)

	var userID string
	if err := tx.QueryRow(ctx, `
UPDATE auth.refresh_tokens
SET revoked_at = now()
WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
RETURNING user_id::text
`, oldHash).Scan(&userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.User{}, ErrNotFound
		}
		return models.User{}, fmt.Errorf("rotate refresh token: %w", err)
	}

	if _, err := tx.Exec(ctx, `
INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
`, userID, newHash, expiresAt); err != nil {
		return models.User{}, fmt.Errorf("insert rotated refresh token: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return models.User{}, fmt.Errorf("commit refresh rotation: %w", err)
	}

	return s.FindUserByID(ctx, userID)
}

func (s *Store) RevokeRefreshToken(ctx context.Context, tokenHash string) error {
	_, err := s.db.Exec(ctx, `UPDATE auth.refresh_tokens SET revoked_at = now() WHERE token_hash = $1`, tokenHash)
	if err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}

	return nil
}

func (s *Store) CreateDomain(ctx context.Context, domain string) (models.Domain, error) {
	row := s.db.QueryRow(ctx, `
INSERT INTO auth.domains (domain, is_allowed)
VALUES ($1, true)
ON CONFLICT (domain) DO UPDATE SET is_allowed = true
RETURNING id::text, domain, is_allowed, created_at
`, domain)
	var item models.Domain
	if err := row.Scan(&item.ID, &item.Domain, &item.IsAllowed, &item.CreatedAt); err != nil {
		return models.Domain{}, fmt.Errorf("create domain: %w", err)
	}
	return item, nil
}

func (s *Store) ListDomains(ctx context.Context) ([]models.Domain, error) {
	rows, err := s.db.Query(ctx, `SELECT id::text, domain, is_allowed, created_at FROM auth.domains ORDER BY domain`)
	if err != nil {
		return nil, fmt.Errorf("list domains: %w", err)
	}
	defer rows.Close()

	var domains []models.Domain
	for rows.Next() {
		var domain models.Domain
		if err := rows.Scan(&domain.ID, &domain.Domain, &domain.IsAllowed, &domain.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan domain: %w", err)
		}
		domains = append(domains, domain)
	}
	return domains, rows.Err()
}

func (s *Store) DeleteDomain(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM auth.domains WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete domain: %w", err)
	}
	return nil
}

func (s *Store) CreateGym(ctx context.Context, req models.GymRequest) (models.Gym, error) {
	strategy := defaultString(req.VerificationStrategy, "verification_endpoint")
	threshold := req.SimilarityThreshold
	if threshold == 0 {
		threshold = 0.85
	}

	row := s.db.QueryRow(ctx, `
INSERT INTO catalog.gyms (name, base_url, description, verification_strategy, flow_count, similarity_enabled, similarity_threshold)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id::text, name, base_url, description, verification_strategy, flow_count, similarity_enabled, similarity_threshold::float8, next_task_number, created_at, updated_at
`, req.Name, req.BaseURL, req.Description, strategy, req.FlowCount, req.SimilarityEnabled, threshold)

	return scanGym(row)
}

func (s *Store) ListGyms(ctx context.Context) ([]models.Gym, error) {
	rows, err := s.db.Query(ctx, `
SELECT gyms.id::text, gyms.name, gyms.base_url, gyms.description, gyms.verification_strategy, gyms.flow_count,
       gyms.similarity_enabled, gyms.similarity_threshold::float8, gyms.next_task_number, gyms.created_at, gyms.updated_at,
       count(tasks.id)::int
FROM catalog.gyms
LEFT JOIN catalog.tasks ON tasks.gym_id = gyms.id
GROUP BY gyms.id
ORDER BY gyms.created_at DESC
`)
	if err != nil {
		return nil, fmt.Errorf("list gyms: %w", err)
	}
	defer rows.Close()

	var gyms []models.Gym
	for rows.Next() {
		gym, err := scanGymWithTaskCount(rows)
		if err != nil {
			return nil, err
		}
		gyms = append(gyms, gym)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list gyms: %w", err)
	}

	stats, err := s.gymStats(ctx)
	if err != nil {
		return nil, err
	}
	for i := range gyms {
		if st, ok := stats[gyms[i].ID]; ok {
			gyms[i].PassRate = st.PassRate
			gyms[i].Runs = st.Runs
		}
	}
	return gyms, nil
}

type gymStat struct {
	PassRate float64
	Runs     int
}

func (s *Store) gymStats(ctx context.Context) (map[string]gymStat, error) {
	rows, err := s.db.Query(ctx, `
SELECT executions.gym_id::text,
       COALESCE(COUNT(*) FILTER (WHERE iterations.status = 'passed')::float / NULLIF(COUNT(iterations.id), 0), 0),
       COUNT(iterations.id)::int
FROM execution.executions
JOIN execution.iterations ON iterations.execution_id = executions.id
GROUP BY executions.gym_id
`)
	if err != nil {
		return nil, fmt.Errorf("gym stats: %w", err)
	}
	defer rows.Close()
	stats := make(map[string]gymStat)
	for rows.Next() {
		var id string
		var st gymStat
		if err := rows.Scan(&id, &st.PassRate, &st.Runs); err != nil {
			return nil, fmt.Errorf("scan gym stat: %w", err)
		}
		stats[id] = st
	}
	return stats, rows.Err()
}

func (s *Store) GetGym(ctx context.Context, id string) (models.Gym, error) {
	row := s.db.QueryRow(ctx, `
SELECT id::text, name, base_url, description, verification_strategy, flow_count,
       similarity_enabled, similarity_threshold::float8, next_task_number, created_at, updated_at
FROM catalog.gyms
WHERE id = $1
`, id)
	return scanGym(row)
}

func (s *Store) UpdateGym(ctx context.Context, id string, req models.GymRequest) (models.Gym, error) {
	strategy := defaultString(req.VerificationStrategy, "verification_endpoint")
	threshold := req.SimilarityThreshold
	if threshold == 0 {
		threshold = 0.85
	}
	row := s.db.QueryRow(ctx, `
UPDATE catalog.gyms
SET name = $2, base_url = $3, description = $4, verification_strategy = $5, flow_count = $6,
    similarity_enabled = $7, similarity_threshold = $8, updated_at = now()
WHERE id = $1
RETURNING id::text, name, base_url, description, verification_strategy, flow_count, similarity_enabled, similarity_threshold::float8, next_task_number, created_at, updated_at
`, id, req.Name, req.BaseURL, req.Description, strategy, req.FlowCount, req.SimilarityEnabled, threshold)
	return scanGym(row)
}

func (s *Store) DeleteGym(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM catalog.gyms WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete gym: %w", err)
	}
	return nil
}

func (s *Store) CreateTask(ctx context.Context, req models.TaskRequest) (models.Task, error) {
	row := s.db.QueryRow(ctx, `
INSERT INTO catalog.tasks (gym_id, task_id, prompt, grader_config, simulator_config, db_json_validator, verifier_path)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id::text, gym_id::text, task_id, prompt, grader_config, simulator_config, db_json_validator, verifier_path, import_metadata, export_metadata, created_at, updated_at, difficulty, status, max_steps, start_url
`, req.GymID, req.TaskID, req.Prompt, jsonValue(req.GraderConfig), jsonValue(req.SimulatorConfig), jsonValue(req.DBJSONValidator), req.VerifierPath)
	return scanTask(row)
}

func (s *Store) ListTasks(ctx context.Context) ([]models.Task, error) {
	rows, err := s.db.Query(ctx, `
SELECT id::text, gym_id::text, task_id, prompt, grader_config, simulator_config, db_json_validator, verifier_path, import_metadata, export_metadata, created_at, updated_at, difficulty, status, max_steps, start_url
FROM catalog.tasks
ORDER BY created_at DESC
`)
	if err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()

	var tasks []models.Task
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}

	stats, err := s.taskStats(ctx)
	if err != nil {
		return nil, err
	}
	for i := range tasks {
		if st, ok := stats[tasks[i].ID]; ok {
			tasks[i].Runs = st.Runs
			tasks[i].PassRate = st.PassRate
			tasks[i].AvgSteps = st.AvgSteps
		}
	}
	return tasks, nil
}

type taskStat struct {
	Runs     int
	PassRate float64
	AvgSteps float64
}

func (s *Store) taskStats(ctx context.Context) (map[string]taskStat, error) {
	rows, err := s.db.Query(ctx, `
SELECT executions.task_id::text,
       COUNT(iterations.id)::int,
       COALESCE(COUNT(*) FILTER (WHERE iterations.status = 'passed')::float / NULLIF(COUNT(iterations.id), 0), 0),
       COALESCE(AVG(NULLIF(iterations.total_steps, 0))::float, 0)
FROM execution.executions
JOIN execution.iterations ON iterations.execution_id = executions.id
WHERE executions.task_id IS NOT NULL
GROUP BY executions.task_id
`)
	if err != nil {
		return nil, fmt.Errorf("task stats: %w", err)
	}
	defer rows.Close()
	stats := make(map[string]taskStat)
	for rows.Next() {
		var id string
		var st taskStat
		if err := rows.Scan(&id, &st.Runs, &st.PassRate, &st.AvgSteps); err != nil {
			return nil, fmt.Errorf("scan task stat: %w", err)
		}
		stats[id] = st
	}
	return stats, rows.Err()
}

func (s *Store) GetTask(ctx context.Context, id string) (models.Task, error) {
	row := s.db.QueryRow(ctx, `
SELECT id::text, gym_id::text, task_id, prompt, grader_config, simulator_config, db_json_validator, verifier_path, import_metadata, export_metadata, created_at, updated_at, difficulty, status, max_steps, start_url
FROM catalog.tasks
WHERE id = $1
`, id)
	return scanTask(row)
}

func (s *Store) UpdateTask(ctx context.Context, id string, req models.TaskRequest) (models.Task, error) {
	row := s.db.QueryRow(ctx, `
UPDATE catalog.tasks
SET gym_id = $2, task_id = $3, prompt = $4, grader_config = $5, simulator_config = $6,
    db_json_validator = $7, verifier_path = $8, difficulty = $9, status = $10, max_steps = $11, start_url = $12, updated_at = now()
WHERE id = $1
RETURNING id::text, gym_id::text, task_id, prompt, grader_config, simulator_config, db_json_validator, verifier_path, import_metadata, export_metadata, created_at, updated_at, difficulty, status, max_steps, start_url
`, id, req.GymID, req.TaskID, req.Prompt, jsonValue(req.GraderConfig), jsonValue(req.SimulatorConfig), jsonValue(req.DBJSONValidator), req.VerifierPath, req.Difficulty, req.Status, req.MaxSteps, req.StartURL)
	return scanTask(row)
}

func (s *Store) DeleteTask(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM catalog.tasks WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete task: %w", err)
	}
	return nil
}

func (s *Store) ListModelProviders(ctx context.Context) ([]models.ModelProvider, error) {
	rows, err := s.db.Query(ctx, `
SELECT id::text, key, name, display_name, adapter_key, base_url, secret_ref, enabled, config, created_at, updated_at, connection_status, last_tested_at
FROM catalog.model_providers
ORDER BY display_name
`)
	if err != nil {
		return nil, fmt.Errorf("list model providers: %w", err)
	}
	defer rows.Close()

	var items []models.ModelProvider
	for rows.Next() {
		item, err := scanModelProvider(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) ListModelDefinitions(ctx context.Context) ([]models.ModelDefinition, error) {
	rows, err := s.db.Query(ctx, `
SELECT id::text, provider_id::text, model_name, display_name, capabilities, config, cost_config,
       timeout_seconds, max_output_tokens, enabled, is_default, created_at, updated_at
FROM catalog.model_definitions
ORDER BY is_default DESC, display_name
`)
	if err != nil {
		return nil, fmt.Errorf("list model definitions: %w", err)
	}
	defer rows.Close()

	var items []models.ModelDefinition
	for rows.Next() {
		item, err := scanModelDefinition(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) GetModelProvider(ctx context.Context, id string) (models.ModelProvider, error) {
	row := s.db.QueryRow(ctx, `
SELECT id::text, key, name, display_name, adapter_key, base_url, secret_ref, enabled, config, created_at, updated_at, connection_status, last_tested_at
FROM catalog.model_providers
WHERE id = $1
`, id)
	return scanModelProvider(row)
}

func (s *Store) CreateModelProvider(ctx context.Context, req models.ModelProviderRequest) (models.ModelProvider, error) {
	name := defaultString(req.Name, req.DisplayName)
	row := s.db.QueryRow(ctx, `
INSERT INTO catalog.model_providers (key, name, display_name, adapter_key, base_url, secret_ref, enabled, config)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id::text, key, name, display_name, adapter_key, base_url, secret_ref, enabled, config, created_at, updated_at, connection_status, last_tested_at
`, req.Key, name, req.DisplayName, req.AdapterKey, req.BaseURL, req.SecretRef, req.Enabled, jsonValue(req.Config))
	return scanModelProvider(row)
}

func (s *Store) UpdateModelProvider(ctx context.Context, id string, req models.ModelProviderRequest) (models.ModelProvider, error) {
	name := defaultString(req.Name, req.DisplayName)
	row := s.db.QueryRow(ctx, `
UPDATE catalog.model_providers
SET key = $2,
    name = $3,
    display_name = $4,
    adapter_key = $5,
    base_url = $6,
    secret_ref = $7,
    enabled = $8,
    config = $9,
    updated_at = now()
WHERE id = $1
RETURNING id::text, key, name, display_name, adapter_key, base_url, secret_ref, enabled, config, created_at, updated_at, connection_status, last_tested_at
`, id, req.Key, name, req.DisplayName, req.AdapterKey, req.BaseURL, req.SecretRef, req.Enabled, jsonValue(req.Config))
	return scanModelProvider(row)
}

func (s *Store) GetModelDefinition(ctx context.Context, id string) (models.ModelDefinition, error) {
	row := s.db.QueryRow(ctx, `
SELECT id::text, provider_id::text, model_name, display_name, capabilities, config, cost_config,
       timeout_seconds, max_output_tokens, enabled, is_default, created_at, updated_at
FROM catalog.model_definitions
WHERE id = $1
`, id)
	return scanModelDefinition(row)
}

func (s *Store) CreateModelDefinition(ctx context.Context, req models.ModelDefinitionRequest) (models.ModelDefinition, error) {
	timeoutSeconds := req.TimeoutSeconds
	if timeoutSeconds <= 0 {
		timeoutSeconds = 60
	}
	row := s.db.QueryRow(ctx, `
INSERT INTO catalog.model_definitions (
  provider_id, model_name, display_name, capabilities, config, cost_config,
  timeout_seconds, max_output_tokens, enabled, is_default
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
RETURNING id::text, provider_id::text, model_name, display_name, capabilities, config, cost_config,
       timeout_seconds, max_output_tokens, enabled, is_default, created_at, updated_at
`, req.ProviderID, req.ModelName, req.DisplayName, jsonValue(req.Capabilities), jsonValue(req.Config), jsonValue(req.CostConfig), timeoutSeconds, req.MaxOutputTokens, req.Enabled)
	item, err := scanModelDefinition(row)
	if err != nil {
		return models.ModelDefinition{}, err
	}
	if req.IsDefault {
		return s.SetDefaultModel(ctx, item.ID)
	}
	return item, nil
}

func (s *Store) UpdateModelDefinition(ctx context.Context, id string, req models.ModelDefinitionRequest) (models.ModelDefinition, error) {
	timeoutSeconds := req.TimeoutSeconds
	if timeoutSeconds <= 0 {
		timeoutSeconds = 60
	}
	row := s.db.QueryRow(ctx, `
UPDATE catalog.model_definitions
SET provider_id = $2,
    model_name = $3,
    display_name = $4,
    capabilities = $5,
    config = $6,
    cost_config = $7,
    timeout_seconds = $8,
    max_output_tokens = $9,
    enabled = $10,
    is_default = false,
    updated_at = now()
WHERE id = $1
RETURNING id::text, provider_id::text, model_name, display_name, capabilities, config, cost_config,
       timeout_seconds, max_output_tokens, enabled, is_default, created_at, updated_at
`, id, req.ProviderID, req.ModelName, req.DisplayName, jsonValue(req.Capabilities), jsonValue(req.Config), jsonValue(req.CostConfig), timeoutSeconds, req.MaxOutputTokens, req.Enabled)
	item, err := scanModelDefinition(row)
	if err != nil {
		return models.ModelDefinition{}, err
	}
	if req.IsDefault {
		return s.SetDefaultModel(ctx, id)
	}
	return item, nil
}

func (s *Store) SetDefaultModel(ctx context.Context, id string) (models.ModelDefinition, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return models.ModelDefinition{}, fmt.Errorf("begin set default model: %w", err)
	}
	defer tx.Rollback(ctx)
	var providerID string
	if err := tx.QueryRow(ctx, `SELECT provider_id::text FROM catalog.model_definitions WHERE id = $1`, id).Scan(&providerID); err != nil {
		return models.ModelDefinition{}, fmt.Errorf("load model provider for default: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE catalog.model_definitions SET is_default = false, updated_at = now() WHERE provider_id = $1`, providerID); err != nil {
		return models.ModelDefinition{}, fmt.Errorf("clear default model: %w", err)
	}
	row := tx.QueryRow(ctx, `
UPDATE catalog.model_definitions
SET is_default = true,
    enabled = true,
    updated_at = now()
WHERE id = $1
RETURNING id::text, provider_id::text, model_name, display_name, capabilities, config, cost_config,
       timeout_seconds, max_output_tokens, enabled, is_default, created_at, updated_at
`, id)
	item, err := scanModelDefinition(row)
	if err != nil {
		return models.ModelDefinition{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return models.ModelDefinition{}, fmt.Errorf("commit set default model: %w", err)
	}
	return item, nil
}

func (s *Store) DeleteModelDefinition(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `UPDATE catalog.model_definitions SET enabled = false, is_default = false, updated_at = now() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("disable model definition: %w", err)
	}
	return nil
}

func (s *Store) GetSystemConfig(ctx context.Context, key string) (models.SystemConfig, error) {
	row := s.db.QueryRow(ctx, `SELECT key, value, updated_at::text FROM catalog.system_config WHERE key = $1`, key)
	var item models.SystemConfig
	var value []byte
	if err := row.Scan(&item.Key, &value, &item.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.SystemConfig{}, ErrNotFound
		}
		return models.SystemConfig{}, fmt.Errorf("get system config: %w", err)
	}
	item.Value = mapFromJSON(value)
	return item, nil
}

func (s *Store) SetSystemConfig(ctx context.Context, key string, value map[string]any) (models.SystemConfig, error) {
	row := s.db.QueryRow(ctx, `
INSERT INTO catalog.system_config (key, value, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
RETURNING key, value, updated_at::text
`, key, jsonValue(value))
	var item models.SystemConfig
	var raw []byte
	if err := row.Scan(&item.Key, &raw, &item.UpdatedAt); err != nil {
		return models.SystemConfig{}, fmt.Errorf("set system config: %w", err)
	}
	item.Value = mapFromJSON(raw)
	return item, nil
}

func (s *Store) DefaultModelID(ctx context.Context) (string, error) {
	var configured string
	err := s.db.QueryRow(ctx, `
SELECT COALESCE(value->>'defaultModelId', '')
FROM catalog.system_config
WHERE key = 'runtime'
`).Scan(&configured)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("get runtime default model: %w", err)
	}
	if configured != "" {
		return configured, nil
	}
	var id string
	if err := s.db.QueryRow(ctx, `
SELECT id::text
FROM catalog.model_definitions
WHERE enabled = true
ORDER BY is_default DESC, created_at ASC
LIMIT 1
`).Scan(&id); err != nil {
		return "", fmt.Errorf("get default model: %w", err)
	}
	return id, nil
}

func (s *Store) CreateBatch(ctx context.Context, req models.BatchCreateRequest, createdBy string) (models.Batch, error) {
	if req.IterationCount < 1 {
		req.IterationCount = 1
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return models.Batch{}, fmt.Errorf("begin batch create: %w", err)
	}
	defer tx.Rollback(ctx)

	taskIDsJSON, _ := json.Marshal(req.TaskIDs)
	modelIDsJSON, _ := json.Marshal(req.ModelIDs)
	var batch models.Batch
	if err := tx.QueryRow(ctx, `
INSERT INTO execution.batches (name, gym_id, created_by, iteration_count, rerun_enabled, selected_task_ids, selected_model_ids)
VALUES ($1, $2, NULLIF($3, '')::uuid, $4, $5, $6, $7)
RETURNING id::text, name, gym_id::text, COALESCE(created_by::text, ''), iteration_count, rerun_enabled, notification_read, created_at
`, req.Name, req.GymID, createdBy, req.IterationCount, req.RerunEnabled, taskIDsJSON, modelIDsJSON).
		Scan(&batch.ID, &batch.Name, &batch.GymID, &batch.CreatedBy, &batch.IterationCount, &batch.RerunEnabled, &batch.NotificationRead, &batch.CreatedAt); err != nil {
		return models.Batch{}, fmt.Errorf("insert batch: %w", err)
	}

	for _, taskID := range req.TaskIDs {
		task, gymStrategy, err := getTaskSnapshot(ctx, tx, taskID)
		if err != nil {
			return models.Batch{}, err
		}
		for _, modelID := range req.ModelIDs {
			var executionID string
			if err := tx.QueryRow(ctx, `
INSERT INTO execution.executions (
  batch_id, gym_id, task_id, model_id, snapshot_task_id, snapshot_prompt, snapshot_grader_config,
  snapshot_simulator_config, snapshot_db_json_validator, snapshot_verifier_path, snapshot_verification_strategy
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING id::text
`, batch.ID, req.GymID, task.ID, modelID, task.TaskID, task.Prompt, jsonValue(task.GraderConfig), jsonValue(task.SimulatorConfig), jsonValue(task.DBJSONValidator), task.VerifierPath, gymStrategy).Scan(&executionID); err != nil {
				return models.Batch{}, fmt.Errorf("insert execution: %w", err)
			}

			for i := 1; i <= req.IterationCount; i++ {
				if _, err := tx.Exec(ctx, `
INSERT INTO execution.iterations (execution_id, iteration_number, status)
VALUES ($1, $2, 'pending')
`, executionID, i); err != nil {
					return models.Batch{}, fmt.Errorf("insert iteration: %w", err)
				}
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return models.Batch{}, fmt.Errorf("commit batch create: %w", err)
	}

	batch.Status = "pending"
	return batch, nil
}

func (s *Store) ListBatches(ctx context.Context) ([]models.Batch, error) {
	rows, err := s.db.Query(ctx, `
SELECT batches.id::text, batches.name, batches.gym_id::text, COALESCE(batches.created_by::text, ''),
       batches.iteration_count, batches.rerun_enabled, batches.notification_read, batches.created_at,
       COALESCE(status_rollup.status, 'pending'), COALESCE(status_rollup.pass_rate, 0), COALESCE(cost_rollup.cost, 0), COALESCE(model_rollup.models, '')
FROM execution.batches
LEFT JOIN LATERAL (
  SELECT execution.compute_batch_status(array_agg(iterations.status)) AS status,
         COALESCE(COUNT(*) FILTER (WHERE iterations.status = 'passed')::float / NULLIF(COUNT(*), 0), 0) AS pass_rate
  FROM execution.executions
  JOIN execution.iterations ON iterations.execution_id = executions.id
  WHERE executions.batch_id = batches.id
) status_rollup ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(cost_usd), 0)::float8 AS cost
  FROM execution.token_usage
  WHERE token_usage.batch_id = batches.id
) cost_rollup ON true
LEFT JOIN LATERAL (
  SELECT string_agg(DISTINCT model_definitions.display_name, ', ') AS models
  FROM execution.executions
  JOIN catalog.model_definitions ON model_definitions.id = executions.model_id
  WHERE executions.batch_id = batches.id
) model_rollup ON true
ORDER BY batches.created_at DESC
`)
	if err != nil {
		return nil, fmt.Errorf("list batches: %w", err)
	}
	defer rows.Close()

	var batches []models.Batch
	for rows.Next() {
		batch, err := scanBatch(rows)
		if err != nil {
			return nil, err
		}
		batches = append(batches, batch)
	}
	return batches, rows.Err()
}

func (s *Store) GetBatchSnapshot(ctx context.Context, batchID string) (models.BatchSnapshot, error) {
	batch, err := s.getBatch(ctx, batchID)
	if err != nil {
		return models.BatchSnapshot{}, err
	}
	executions, err := s.listExecutions(ctx, batchID)
	if err != nil {
		return models.BatchSnapshot{}, err
	}
	iterations, err := s.listIterations(ctx, batchID)
	if err != nil {
		return models.BatchSnapshot{}, err
	}
	artifacts, err := s.listArtifactsForIterations(ctx, iterations)
	if err != nil {
		return models.BatchSnapshot{}, err
	}
	attachArtifactsToIterations(iterations, artifacts)
	gyms, tasks, modelsByID, err := s.snapshotCatalog(ctx, batchID)
	if err != nil {
		return models.BatchSnapshot{}, err
	}
	report := s.latestBatchReportReadiness(ctx, batchID)

	counts := map[string]int{"total": len(iterations)}
	for _, iteration := range iterations {
		counts[iteration.Status]++
	}

	return models.BatchSnapshot{
		Batch:      batch,
		Executions: executions,
		Iterations: iterations,
		Counts:     counts,
		Report:     report,
		Catalog: models.SnapshotCatalog{
			Gyms:   gyms,
			Tasks:  tasks,
			Models: modelsByID,
		},
	}, nil
}

func (s *Store) ListCancelableIterationIDs(ctx context.Context, batchID string) ([]string, error) {
	rows, err := s.db.Query(ctx, `
SELECT iterations.id::text
FROM execution.iterations
JOIN execution.executions ON executions.id = iterations.execution_id
WHERE executions.batch_id = $1
  AND iterations.status IN ('pending', 'retrying', 'executing')
ORDER BY executions.created_at, iterations.iteration_number
`, batchID)
	if err != nil {
		return nil, fmt.Errorf("list cancelable iterations: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan cancelable iteration: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *Store) GetTokenUsageSummary(ctx context.Context, filters models.UsageFilters) (models.TokenUsageSummary, error) {
	where, args := usageWhere(filters)
	row := s.db.QueryRow(ctx, `
SELECT COALESCE(SUM(input_tokens), 0)::bigint,
       COALESCE(SUM(output_tokens), 0)::bigint,
       COALESCE(SUM(input_tokens + output_tokens), 0)::bigint,
       COALESCE(SUM(cost_usd), 0)::float8,
       COUNT(*)::bigint
FROM execution.token_usage
`+where, args...)
	var summary models.TokenUsageSummary
	if err := row.Scan(&summary.InputTokens, &summary.OutputTokens, &summary.TotalTokens, &summary.TotalCostUSD, &summary.Runs); err != nil {
		return models.TokenUsageSummary{}, fmt.Errorf("token usage summary: %w", err)
	}
	modelBreakdown, err := s.usageBreakdown(ctx, filters, "model_id::text", "COALESCE(model_name, '')")
	if err != nil {
		return models.TokenUsageSummary{}, err
	}
	gymBreakdown, err := s.usageBreakdown(ctx, filters, "gym_id::text", "COALESCE(gym_name, '')")
	if err != nil {
		return models.TokenUsageSummary{}, err
	}
	series, err := s.usageSeries(ctx, filters)
	if err != nil {
		return models.TokenUsageSummary{}, err
	}
	summary.ByModel = modelBreakdown
	summary.ByGym = gymBreakdown
	summary.Series = series
	return summary, nil
}

func (s *Store) usageSeries(ctx context.Context, filters models.UsageFilters) ([]models.UsageBucket, error) {
	where, args := usageWhere(filters)
	rows, err := s.db.Query(ctx, `
SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
       COALESCE(SUM(input_tokens + output_tokens), 0)::bigint,
       COALESCE(SUM(cost_usd), 0)::float8
FROM execution.token_usage
`+where+`
GROUP BY 1
ORDER BY 1
`, args...)
	if err != nil {
		return nil, fmt.Errorf("token usage series: %w", err)
	}
	defer rows.Close()
	var buckets []models.UsageBucket
	for rows.Next() {
		var bucket models.UsageBucket
		if err := rows.Scan(&bucket.Date, &bucket.TotalTokens, &bucket.TotalCostUSD); err != nil {
			return nil, fmt.Errorf("scan usage series: %w", err)
		}
		buckets = append(buckets, bucket)
	}
	return buckets, rows.Err()
}

func (s *Store) GetTokenUsageFilters(ctx context.Context) (models.TokenUsageFilters, error) {
	batches, err := s.filterOptions(ctx, "batch_id::text", "COALESCE(batches.name, batch_id::text)", "LEFT JOIN execution.batches ON batches.id = token_usage.batch_id")
	if err != nil {
		return models.TokenUsageFilters{}, err
	}
	gyms, err := s.filterOptions(ctx, "gym_id::text", "COALESCE(gym_name, '')", "")
	if err != nil {
		return models.TokenUsageFilters{}, err
	}
	modelsByID, err := s.filterOptions(ctx, "model_id::text", "COALESCE(model_name, '')", "")
	if err != nil {
		return models.TokenUsageFilters{}, err
	}
	return models.TokenUsageFilters{Batches: batches, Gyms: gyms, Models: modelsByID}, nil
}

func (s *Store) ExportTokenUsageCSV(ctx context.Context, filters models.UsageFilters) ([]byte, error) {
	where, args := usageWhere(filters)
	rows, err := s.db.Query(ctx, `
SELECT COALESCE(batch_id::text, ''), COALESCE(gym_name, ''), COALESCE(model_name, ''),
       input_tokens, output_tokens, input_tokens + output_tokens, cost_usd::float8, created_at::text
FROM execution.token_usage
`+where+`
ORDER BY created_at DESC
`, args...)
	if err != nil {
		return nil, fmt.Errorf("token usage csv: %w", err)
	}
	defer rows.Close()
	var buffer bytes.Buffer
	writer := csv.NewWriter(&buffer)
	_ = writer.Write([]string{"batchId", "gym", "model", "inputTokens", "outputTokens", "totalTokens", "costUsd", "createdAt"})
	for rows.Next() {
		var batchID, gym, model, createdAt string
		var inputTokens, outputTokens, totalTokens int64
		var cost float64
		if err := rows.Scan(&batchID, &gym, &model, &inputTokens, &outputTokens, &totalTokens, &cost, &createdAt); err != nil {
			return nil, fmt.Errorf("scan token usage csv: %w", err)
		}
		_ = writer.Write([]string{batchID, gym, model, fmt.Sprint(inputTokens), fmt.Sprint(outputTokens), fmt.Sprint(totalTokens), fmt.Sprintf("%.6f", cost), createdAt})
	}
	writer.Flush()
	return buffer.Bytes(), rows.Err()
}

func (s *Store) GetLeaderboard(ctx context.Context, filters models.LeaderboardFilters) ([]models.LeaderboardRow, error) {
	where, args := leaderboardWhere(filters)
	rows, err := s.db.Query(ctx, `
WITH usage AS (
  SELECT model_id, gym_id,
         COALESCE(SUM(input_tokens + output_tokens), 0)::bigint AS total_tokens,
         COALESCE(SUM(cost_usd), 0)::float8 AS total_cost
  FROM execution.token_usage
  GROUP BY model_id, gym_id
)
SELECT executions.model_id::text,
       COALESCE(model_definitions.display_name, model_definitions.model_name, ''),
       executions.gym_id::text,
       COALESCE(gyms.name, ''),
       COUNT(iterations.id)::bigint,
       COUNT(iterations.id) FILTER (WHERE iterations.status = 'passed')::bigint,
       COUNT(iterations.id) FILTER (WHERE iterations.status IN ('failed','crashed','timeout','terminated','cancelled'))::bigint,
       COALESCE(AVG(iterations.total_steps), 0)::float8,
       COALESCE(AVG(EXTRACT(EPOCH FROM (iterations.completed_at - iterations.started_at))) FILTER (WHERE iterations.started_at IS NOT NULL AND iterations.completed_at IS NOT NULL), 0)::float8,
       COALESCE(MAX(usage.total_tokens), 0)::bigint,
       COALESCE(MAX(usage.total_cost), 0)::float8
FROM execution.iterations
JOIN execution.executions ON executions.id = iterations.execution_id
JOIN catalog.model_definitions ON model_definitions.id = executions.model_id
JOIN catalog.gyms ON gyms.id = executions.gym_id
LEFT JOIN usage ON usage.model_id = executions.model_id AND usage.gym_id = executions.gym_id
`+where+`
GROUP BY executions.model_id, model_definitions.display_name, model_definitions.model_name, executions.gym_id, gyms.name
ORDER BY 7 DESC, 5 DESC
`, args...)
	if err != nil {
		return nil, fmt.Errorf("leaderboard query: %w", err)
	}
	defer rows.Close()
	var items []models.LeaderboardRow
	for rows.Next() {
		var item models.LeaderboardRow
		if err := rows.Scan(&item.ModelID, &item.ModelName, &item.GymID, &item.GymName, &item.Runs, &item.Passed, &item.Failed, &item.AverageSteps, &item.AverageSeconds, &item.TotalTokens, &item.TotalCostUSD); err != nil {
			return nil, fmt.Errorf("scan leaderboard: %w", err)
		}
		if item.Runs > 0 {
			item.PassRate = float64(item.Passed) / float64(item.Runs)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("leaderboard rows: %w", err)
	}
	rows.Close()

	trends, err := s.leaderboardTrends(ctx, where, args)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].Trend = trends[items[i].ModelID+"|"+items[i].GymID]
	}
	return items, nil
}

func (s *Store) leaderboardTrends(ctx context.Context, where string, args []any) (map[string][]float64, error) {
	rows, err := s.db.Query(ctx, `
SELECT executions.model_id::text, executions.gym_id::text,
       COALESCE(COUNT(*) FILTER (WHERE iterations.status = 'passed')::float / NULLIF(COUNT(*), 0), 0)
FROM execution.iterations
JOIN execution.executions ON executions.id = iterations.execution_id
`+where+`
GROUP BY executions.model_id, executions.gym_id, date_trunc('day', iterations.created_at)
ORDER BY executions.model_id, executions.gym_id, date_trunc('day', iterations.created_at)
`, args...)
	if err != nil {
		return nil, fmt.Errorf("leaderboard trends: %w", err)
	}
	defer rows.Close()
	trends := make(map[string][]float64)
	for rows.Next() {
		var modelID, gymID string
		var passRate float64
		if err := rows.Scan(&modelID, &gymID, &passRate); err != nil {
			return nil, fmt.Errorf("scan leaderboard trend: %w", err)
		}
		key := modelID + "|" + gymID
		trends[key] = append(trends[key], passRate)
	}
	return trends, rows.Err()
}

// scan helpers and compact query helpers are intentionally local to keep the first Phase 2 store readable.
type scanner interface {
	Scan(dest ...any) error
}

func scanGym(row scanner) (models.Gym, error) {
	var gym models.Gym
	if err := row.Scan(&gym.ID, &gym.Name, &gym.BaseURL, &gym.Description, &gym.VerificationStrategy, &gym.FlowCount, &gym.SimilarityEnabled, &gym.SimilarityThreshold, &gym.NextTaskNumber, &gym.CreatedAt, &gym.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Gym{}, ErrNotFound
		}
		return models.Gym{}, fmt.Errorf("scan gym: %w", err)
	}
	return gym, nil
}

func scanGymWithTaskCount(row scanner) (models.Gym, error) {
	var gym models.Gym
	if err := row.Scan(&gym.ID, &gym.Name, &gym.BaseURL, &gym.Description, &gym.VerificationStrategy, &gym.FlowCount, &gym.SimilarityEnabled, &gym.SimilarityThreshold, &gym.NextTaskNumber, &gym.CreatedAt, &gym.UpdatedAt, &gym.TaskCount); err != nil {
		return models.Gym{}, fmt.Errorf("scan gym with task count: %w", err)
	}
	return gym, nil
}

func scanTask(row scanner) (models.Task, error) {
	var task models.Task
	var graderConfig, simulatorConfig, dbJSONValidator, importMetadata, exportMetadata []byte
	if err := row.Scan(&task.ID, &task.GymID, &task.TaskID, &task.Prompt, &graderConfig, &simulatorConfig, &dbJSONValidator, &task.VerifierPath, &importMetadata, &exportMetadata, &task.CreatedAt, &task.UpdatedAt, &task.Difficulty, &task.Status, &task.MaxSteps, &task.StartURL); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Task{}, ErrNotFound
		}
		return models.Task{}, fmt.Errorf("scan task: %w", err)
	}
	task.GraderConfig = mapFromJSON(graderConfig)
	task.SimulatorConfig = mapFromJSON(simulatorConfig)
	task.DBJSONValidator = mapFromJSON(dbJSONValidator)
	task.ImportMetadata = mapFromJSON(importMetadata)
	task.ExportMetadata = mapFromJSON(exportMetadata)
	return task, nil
}

func scanModelProvider(row scanner) (models.ModelProvider, error) {
	var item models.ModelProvider
	var config []byte
	if err := row.Scan(&item.ID, &item.Key, &item.Name, &item.DisplayName, &item.AdapterKey, &item.BaseURL, &item.SecretRef, &item.Enabled, &config, &item.CreatedAt, &item.UpdatedAt, &item.ConnectionStatus, &item.LastTestedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.ModelProvider{}, ErrNotFound
		}
		return models.ModelProvider{}, fmt.Errorf("scan model provider: %w", err)
	}
	item.Config = mapFromJSON(config)
	return item, nil
}

func (s *Store) SetProviderConnectionStatus(ctx context.Context, id string, status string) error {
	_, err := s.db.Exec(ctx, `UPDATE catalog.model_providers SET connection_status = $2, last_tested_at = now() WHERE id = $1`, id, status)
	if err != nil {
		return fmt.Errorf("set provider connection status: %w", err)
	}
	return nil
}

func scanModelDefinition(row scanner) (models.ModelDefinition, error) {
	var item models.ModelDefinition
	var capabilities, config, costConfig []byte
	if err := row.Scan(&item.ID, &item.ProviderID, &item.ModelName, &item.DisplayName, &capabilities, &config, &costConfig, &item.TimeoutSeconds, &item.MaxOutputTokens, &item.Enabled, &item.IsDefault, &item.CreatedAt, &item.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.ModelDefinition{}, ErrNotFound
		}
		return models.ModelDefinition{}, fmt.Errorf("scan model definition: %w", err)
	}
	item.Capabilities = mapFromJSON(capabilities)
	item.Config = mapFromJSON(config)
	item.CostConfig = mapFromJSON(costConfig)
	return item, nil
}

func scanBatch(row scanner) (models.Batch, error) {
	var batch models.Batch
	if err := row.Scan(&batch.ID, &batch.Name, &batch.GymID, &batch.CreatedBy, &batch.IterationCount, &batch.RerunEnabled, &batch.NotificationRead, &batch.CreatedAt, &batch.Status, &batch.PassRate, &batch.Cost, &batch.Models); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Batch{}, ErrNotFound
		}
		return models.Batch{}, fmt.Errorf("scan batch: %w", err)
	}
	return batch, nil
}

func getTaskSnapshot(ctx context.Context, tx pgx.Tx, taskID string) (models.Task, string, error) {
	row := tx.QueryRow(ctx, `
SELECT tasks.id::text, tasks.gym_id::text, tasks.task_id, tasks.prompt, tasks.grader_config, tasks.simulator_config,
       tasks.db_json_validator, tasks.verifier_path, tasks.import_metadata, tasks.export_metadata, tasks.created_at, tasks.updated_at,
       gyms.verification_strategy
FROM catalog.tasks
JOIN catalog.gyms ON gyms.id = tasks.gym_id
WHERE tasks.id = $1
`, taskID)
	var strategy string
	var task models.Task
	var graderConfig, simulatorConfig, dbJSONValidator, importMetadata, exportMetadata []byte
	if err := row.Scan(&task.ID, &task.GymID, &task.TaskID, &task.Prompt, &graderConfig, &simulatorConfig, &dbJSONValidator, &task.VerifierPath, &importMetadata, &exportMetadata, &task.CreatedAt, &task.UpdatedAt, &strategy); err != nil {
		return models.Task{}, "", fmt.Errorf("get task snapshot: %w", err)
	}
	task.GraderConfig = mapFromJSON(graderConfig)
	task.SimulatorConfig = mapFromJSON(simulatorConfig)
	task.DBJSONValidator = mapFromJSON(dbJSONValidator)
	task.ImportMetadata = mapFromJSON(importMetadata)
	task.ExportMetadata = mapFromJSON(exportMetadata)
	return task, strategy, nil
}

func (s *Store) getBatch(ctx context.Context, batchID string) (models.Batch, error) {
	row := s.db.QueryRow(ctx, `
SELECT batches.id::text, batches.name, batches.gym_id::text, COALESCE(batches.created_by::text, ''),
       batches.iteration_count, batches.rerun_enabled, batches.notification_read, batches.created_at,
       COALESCE(status_rollup.status, 'pending'), COALESCE(status_rollup.pass_rate, 0), COALESCE(cost_rollup.cost, 0), COALESCE(model_rollup.models, '')
FROM execution.batches
LEFT JOIN LATERAL (
  SELECT execution.compute_batch_status(array_agg(iterations.status)) AS status,
         COALESCE(COUNT(*) FILTER (WHERE iterations.status = 'passed')::float / NULLIF(COUNT(*), 0), 0) AS pass_rate
  FROM execution.executions
  JOIN execution.iterations ON iterations.execution_id = executions.id
  WHERE executions.batch_id = batches.id
) status_rollup ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(cost_usd), 0)::float8 AS cost
  FROM execution.token_usage
  WHERE token_usage.batch_id = batches.id
) cost_rollup ON true
LEFT JOIN LATERAL (
  SELECT string_agg(DISTINCT model_definitions.display_name, ', ') AS models
  FROM execution.executions
  JOIN catalog.model_definitions ON model_definitions.id = executions.model_id
  WHERE executions.batch_id = batches.id
) model_rollup ON true
WHERE batches.id = $1
`, batchID)
	return scanBatch(row)
}

func (s *Store) listExecutions(ctx context.Context, batchID string) ([]models.Execution, error) {
	rows, err := s.db.Query(ctx, `
SELECT executions.id::text, executions.batch_id::text, executions.gym_id::text, COALESCE(executions.task_id::text, ''),
       executions.model_id::text, executions.execution_type, execution.compute_execution_status(array_agg(iterations.status)),
       executions.snapshot_task_id, executions.snapshot_prompt, executions.snapshot_grader_config,
       executions.snapshot_simulator_config, executions.snapshot_db_json_validator, executions.snapshot_verifier_path,
       executions.snapshot_verification_strategy, executions.created_at
FROM execution.executions
LEFT JOIN execution.iterations ON iterations.execution_id = executions.id
WHERE executions.batch_id = $1
GROUP BY executions.id
ORDER BY executions.created_at
`, batchID)
	if err != nil {
		return nil, fmt.Errorf("list executions: %w", err)
	}
	defer rows.Close()
	var executions []models.Execution
	for rows.Next() {
		var execution models.Execution
		var graderConfig, simulatorConfig, dbJSONValidator []byte
		if err := rows.Scan(&execution.ID, &execution.BatchID, &execution.GymID, &execution.TaskID, &execution.ModelID, &execution.ExecutionType, &execution.Status, &execution.SnapshotTaskID, &execution.SnapshotPrompt, &graderConfig, &simulatorConfig, &dbJSONValidator, &execution.SnapshotVerifierPath, &execution.SnapshotVerificationStrategy, &execution.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan execution: %w", err)
		}
		execution.SnapshotGraderConfig = mapFromJSON(graderConfig)
		execution.SnapshotSimulatorConfig = mapFromJSON(simulatorConfig)
		execution.SnapshotDBJSONValidator = mapFromJSON(dbJSONValidator)
		executions = append(executions, execution)
	}
	return executions, rows.Err()
}

func (s *Store) listIterations(ctx context.Context, batchID string) ([]models.Iteration, error) {
	rows, err := s.db.Query(ctx, `
SELECT iterations.id::text, iterations.execution_id::text, iterations.iteration_number, iterations.status,
       iterations.sub_status, iterations.failure_context, iterations.attempt,
       COALESCE(iterations.celery_task_id, ''), iterations.worker_id,
       COALESCE(iterations.heartbeat_at::text, ''), COALESCE(iterations.lease_expires_at::text, ''),
       COALESCE(iterations.cancel_requested, false), COALESCE(iterations.cancelled_at::text, ''),
       COALESCE(iterations.started_at::text, ''), COALESCE(iterations.completed_at::text, ''),
       COALESCE(iterations.timeline_artifact_id::text, ''),
       iterations.result_data,
       iterations.total_steps, iterations.created_at,
       COALESCE(tok.cost, 0)
FROM execution.iterations
JOIN execution.executions ON executions.id = iterations.execution_id
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(cost_usd), 0)::float8 AS cost
  FROM execution.token_usage
  WHERE token_usage.iteration_id = iterations.id
) tok ON true
WHERE executions.batch_id = $1
ORDER BY executions.created_at, iterations.iteration_number
`, batchID)
	if err != nil {
		return nil, fmt.Errorf("list iterations: %w", err)
	}
	defer rows.Close()
	var iterations []models.Iteration
	for rows.Next() {
		var iteration models.Iteration
		var resultData []byte
		if err := rows.Scan(
			&iteration.ID,
			&iteration.ExecutionID,
			&iteration.IterationNumber,
			&iteration.Status,
			&iteration.SubStatus,
			&iteration.FailureContext,
			&iteration.Attempt,
			&iteration.CeleryTaskID,
			&iteration.WorkerID,
			&iteration.HeartbeatAt,
			&iteration.LeaseExpiresAt,
			&iteration.CancelRequested,
			&iteration.CancelledAt,
			&iteration.StartedAt,
			&iteration.CompletedAt,
			&iteration.TimelineArtifactID,
			&resultData,
			&iteration.TotalSteps,
			&iteration.CreatedAt,
			&iteration.Cost,
		); err != nil {
			return nil, fmt.Errorf("scan iteration: %w", err)
		}
		iteration.ResultData = mapFromJSON(resultData)
		iterations = append(iterations, iteration)
	}
	return iterations, rows.Err()
}

func (s *Store) listArtifactsForIterations(ctx context.Context, iterations []models.Iteration) ([]models.Artifact, error) {
	if len(iterations) == 0 {
		return nil, nil
	}
	scopes := make([]string, 0, len(iterations))
	for _, iteration := range iterations {
		scopes = append(scopes, "iterations/"+iteration.ID)
	}
	rows, err := s.db.Query(ctx, `
SELECT id::text, scope, artifact_type, object_key, size_bytes, content_hash, metadata, created_at::text
FROM artifacts.artifacts
WHERE scope = ANY($1)
ORDER BY scope, created_at
`, scopes)
	if err != nil {
		return nil, fmt.Errorf("list iteration artifacts: %w", err)
	}
	defer rows.Close()
	var artifacts []models.Artifact
	for rows.Next() {
		var artifact models.Artifact
		var metadata []byte
		if err := rows.Scan(&artifact.ID, &artifact.Scope, &artifact.ArtifactType, &artifact.ObjectKey, &artifact.SizeBytes, &artifact.ContentHash, &metadata, &artifact.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan iteration artifact: %w", err)
		}
		artifact.Metadata = mapFromJSON(metadata)
		artifacts = append(artifacts, artifact)
	}
	return artifacts, rows.Err()
}

func attachArtifactsToIterations(iterations []models.Iteration, artifacts []models.Artifact) {
	byScope := make(map[string][]models.Artifact, len(iterations))
	for _, artifact := range artifacts {
		byScope[artifact.Scope] = append(byScope[artifact.Scope], artifact)
	}
	for index := range iterations {
		iterations[index].Artifacts = byScope["iterations/"+iterations[index].ID]
	}
}

func (s *Store) usageBreakdown(ctx context.Context, filters models.UsageFilters, idExpr string, nameExpr string) ([]models.UsageBreakdown, error) {
	where, args := usageWhere(filters)
	rows, err := s.db.Query(ctx, fmt.Sprintf(`
SELECT COALESCE(%s, ''), %s,
       COALESCE(SUM(input_tokens), 0)::bigint,
       COALESCE(SUM(output_tokens), 0)::bigint,
       COALESCE(SUM(input_tokens + output_tokens), 0)::bigint,
       COALESCE(SUM(cost_usd), 0)::float8,
       COUNT(*)::bigint
FROM execution.token_usage
%s
GROUP BY 1, 2
ORDER BY 7 DESC, 2
`, idExpr, nameExpr, where), args...)
	if err != nil {
		return nil, fmt.Errorf("token usage breakdown: %w", err)
	}
	defer rows.Close()
	var items []models.UsageBreakdown
	for rows.Next() {
		var item models.UsageBreakdown
		if err := rows.Scan(&item.ID, &item.Name, &item.InputTokens, &item.OutputTokens, &item.TotalTokens, &item.TotalCostUSD, &item.Runs); err != nil {
			return nil, fmt.Errorf("scan token usage breakdown: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) filterOptions(ctx context.Context, idExpr string, nameExpr string, join string) ([]models.FilterOption, error) {
	rows, err := s.db.Query(ctx, fmt.Sprintf(`
SELECT DISTINCT COALESCE(%s, ''), %s
FROM execution.token_usage token_usage
%s
WHERE %s IS NOT NULL
ORDER BY 2
`, idExpr, nameExpr, join, idExpr))
	if err != nil {
		return nil, fmt.Errorf("token usage filters: %w", err)
	}
	defer rows.Close()
	var items []models.FilterOption
	for rows.Next() {
		var item models.FilterOption
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			return nil, fmt.Errorf("scan token usage filter: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func usageWhere(filters models.UsageFilters) (string, []any) {
	clauses := []string{}
	args := []any{}
	add := func(clause string, value string) {
		if value == "" {
			return
		}
		args = append(args, value)
		clauses = append(clauses, fmt.Sprintf(clause, len(args)))
	}
	add("batch_id = $%d", filters.BatchID)
	add("gym_id = $%d", filters.GymID)
	add("model_id = $%d", filters.ModelID)
	add("created_at >= $%d::timestamptz", filters.From)
	add("created_at <= $%d::timestamptz", filters.To)
	if len(clauses) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}

func leaderboardWhere(filters models.LeaderboardFilters) (string, []any) {
	clauses := []string{}
	args := []any{}
	add := func(clause string, value string) {
		if value == "" {
			return
		}
		args = append(args, value)
		clauses = append(clauses, fmt.Sprintf(clause, len(args)))
	}
	add("executions.batch_id = $%d", filters.BatchID)
	add("executions.gym_id = $%d", filters.GymID)
	add("executions.model_id = $%d", filters.ModelID)
	add("iterations.created_at >= $%d::timestamptz", filters.From)
	add("iterations.created_at <= $%d::timestamptz", filters.To)
	if len(clauses) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}

func (s *Store) latestBatchReportReadiness(ctx context.Context, batchID string) models.ReportReadiness {
	row := s.db.QueryRow(ctx, `
SELECT id::text, job_type, scope_type, scope_id, format, payload, status, COALESCE(error, ''),
       COALESCE(generated_artifact_id::text, ''), COALESCE(requested_by::text, ''),
       created_at::text, COALESCE(started_at::text, ''), COALESCE(completed_at::text, '')
FROM reports.report_jobs
WHERE scope_type = 'batch' AND scope_id = $1
ORDER BY created_at DESC
LIMIT 1
`, batchID)
	var job models.ReportJob
	var payload []byte
	if err := row.Scan(&job.ID, &job.JobType, &job.ScopeType, &job.ScopeID, &job.Format, &payload, &job.Status, &job.Error, &job.GeneratedArtifactID, &job.RequestedBy, &job.CreatedAt, &job.StartedAt, &job.CompletedAt); err != nil {
		return defaultReportReadiness()
	}
	job.Payload = mapFromJSON(payload)
	return reportReadinessFromJob(job)
}

func defaultReportReadiness() models.ReportReadiness {
	return models.ReportReadiness{Status: "not_configured"}
}

func reportReadinessFromJob(job models.ReportJob) models.ReportReadiness {
	return models.ReportReadiness{
		Status:      job.Status,
		ReportJobID: job.ID,
		ArtifactID:  job.GeneratedArtifactID,
		RequestedAt: job.CreatedAt,
		CompletedAt: job.CompletedAt,
		Error:       job.Error,
	}
}

func (s *Store) snapshotCatalog(ctx context.Context, batchID string) (map[string]models.Gym, map[string]models.Task, map[string]models.ModelDefinition, error) {
	gyms := map[string]models.Gym{}
	tasks := map[string]models.Task{}
	modelsByID := map[string]models.ModelDefinition{}

	gymRows, err := s.db.Query(ctx, `
SELECT DISTINCT gyms.id::text, gyms.name, gyms.base_url, gyms.description, gyms.verification_strategy,
       gyms.flow_count, gyms.similarity_enabled, gyms.similarity_threshold::float8, gyms.next_task_number,
       gyms.created_at, gyms.updated_at
FROM execution.executions
JOIN catalog.gyms ON gyms.id = executions.gym_id
WHERE executions.batch_id = $1
`, batchID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("snapshot gyms: %w", err)
	}
	defer gymRows.Close()
	for gymRows.Next() {
		gym, err := scanGym(gymRows)
		if err != nil {
			return nil, nil, nil, err
		}
		gyms[gym.ID] = gym
	}

	taskRows, err := s.db.Query(ctx, `
SELECT DISTINCT tasks.id::text, tasks.gym_id::text, tasks.task_id, tasks.prompt, tasks.grader_config,
       tasks.simulator_config, tasks.db_json_validator, tasks.verifier_path, tasks.import_metadata,
       tasks.export_metadata, tasks.created_at, tasks.updated_at, tasks.difficulty, tasks.status, tasks.max_steps, tasks.start_url
FROM execution.executions
JOIN catalog.tasks ON tasks.id = executions.task_id
WHERE executions.batch_id = $1
`, batchID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("snapshot tasks: %w", err)
	}
	defer taskRows.Close()
	for taskRows.Next() {
		task, err := scanTask(taskRows)
		if err != nil {
			return nil, nil, nil, err
		}
		tasks[task.ID] = task
	}

	modelRows, err := s.db.Query(ctx, `
SELECT DISTINCT models.id::text, models.provider_id::text, models.model_name, models.display_name,
       models.capabilities, models.config, models.cost_config, models.timeout_seconds, models.max_output_tokens,
       models.enabled, models.is_default, models.created_at, models.updated_at
FROM execution.executions
JOIN catalog.model_definitions models ON models.id = executions.model_id
WHERE executions.batch_id = $1
`, batchID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("snapshot models: %w", err)
	}
	defer modelRows.Close()
	for modelRows.Next() {
		model, err := scanModelDefinition(modelRows)
		if err != nil {
			return nil, nil, nil, err
		}
		modelsByID[model.ID] = model
	}

	return gyms, tasks, modelsByID, nil
}

func jsonValue(value map[string]any) []byte {
	if value == nil {
		value = map[string]any{}
	}
	bytes, _ := json.Marshal(value)
	return bytes
}

func mapFromJSON(value []byte) map[string]any {
	var out map[string]any
	if len(value) == 0 {
		return map[string]any{}
	}
	if err := json.Unmarshal(value, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func (s *Store) GetBatchAnalytics(ctx context.Context, batchID string) (models.BatchAnalytics, error) {
	rows, err := s.db.Query(ctx, `
SELECT iterations.id::text,
       executions.snapshot_task_id,
       iterations.status,
       iterations.total_steps,
       COALESCE(tok.tokens, 0)::bigint,
       COALESCE(tok.cost, 0)::float8
FROM execution.iterations
JOIN execution.executions ON executions.id = iterations.execution_id
LEFT JOIN LATERAL (
  SELECT SUM(input_tokens + output_tokens) AS tokens, SUM(cost_usd) AS cost
  FROM execution.token_usage
  WHERE token_usage.iteration_id = iterations.id
) tok ON true
WHERE executions.batch_id = $1
ORDER BY executions.snapshot_task_id, iterations.iteration_number
`, batchID)
	if err != nil {
		return models.BatchAnalytics{}, fmt.Errorf("batch analytics: %w", err)
	}
	defer rows.Close()

	analytics := models.BatchAnalytics{}
	taskIndex := map[string]int{}
	var stepsSum, stepsCount int
	for rows.Next() {
		var it models.IterationAnalytics
		if err := rows.Scan(&it.ID, &it.TaskID, &it.Status, &it.Steps, &it.Tokens, &it.CostUSD); err != nil {
			return models.BatchAnalytics{}, fmt.Errorf("scan batch analytics: %w", err)
		}
		analytics.Iterations = append(analytics.Iterations, it)
		analytics.Total++
		passed := it.Status == "passed"
		if passed {
			analytics.Passed++
		}
		if it.Steps > 0 {
			stepsSum += it.Steps
			stepsCount++
		}
		idx, ok := taskIndex[it.TaskID]
		if !ok {
			idx = len(analytics.ByTask)
			taskIndex[it.TaskID] = idx
			analytics.ByTask = append(analytics.ByTask, models.TaskOutcome{TaskID: it.TaskID})
		}
		analytics.ByTask[idx].Total++
		if passed {
			analytics.ByTask[idx].Passed++
		}
	}
	if err := rows.Err(); err != nil {
		return models.BatchAnalytics{}, fmt.Errorf("batch analytics rows: %w", err)
	}
	if analytics.Total > 0 {
		analytics.PassRate = float64(analytics.Passed) / float64(analytics.Total)
	}
	if stepsCount > 0 {
		analytics.AvgSteps = float64(stepsSum) / float64(stepsCount)
	}
	for i := range analytics.ByTask {
		if analytics.ByTask[i].Total > 0 {
			analytics.ByTask[i].PassRate = float64(analytics.ByTask[i].Passed) / float64(analytics.ByTask[i].Total)
		}
	}
	return analytics, nil
}
