package repositories

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
	return gyms, rows.Err()
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
RETURNING id::text, gym_id::text, task_id, prompt, grader_config, simulator_config, db_json_validator, verifier_path, import_metadata, export_metadata, created_at, updated_at
`, req.GymID, req.TaskID, req.Prompt, jsonValue(req.GraderConfig), jsonValue(req.SimulatorConfig), jsonValue(req.DBJSONValidator), req.VerifierPath)
	return scanTask(row)
}

func (s *Store) ListTasks(ctx context.Context) ([]models.Task, error) {
	rows, err := s.db.Query(ctx, `
SELECT id::text, gym_id::text, task_id, prompt, grader_config, simulator_config, db_json_validator, verifier_path, import_metadata, export_metadata, created_at, updated_at
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
	return tasks, rows.Err()
}

func (s *Store) GetTask(ctx context.Context, id string) (models.Task, error) {
	row := s.db.QueryRow(ctx, `
SELECT id::text, gym_id::text, task_id, prompt, grader_config, simulator_config, db_json_validator, verifier_path, import_metadata, export_metadata, created_at, updated_at
FROM catalog.tasks
WHERE id = $1
`, id)
	return scanTask(row)
}

func (s *Store) UpdateTask(ctx context.Context, id string, req models.TaskRequest) (models.Task, error) {
	row := s.db.QueryRow(ctx, `
UPDATE catalog.tasks
SET gym_id = $2, task_id = $3, prompt = $4, grader_config = $5, simulator_config = $6,
    db_json_validator = $7, verifier_path = $8, updated_at = now()
WHERE id = $1
RETURNING id::text, gym_id::text, task_id, prompt, grader_config, simulator_config, db_json_validator, verifier_path, import_metadata, export_metadata, created_at, updated_at
`, id, req.GymID, req.TaskID, req.Prompt, jsonValue(req.GraderConfig), jsonValue(req.SimulatorConfig), jsonValue(req.DBJSONValidator), req.VerifierPath)
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
	rows, err := s.db.Query(ctx, `SELECT id::text, name, adapter_key, enabled, config, created_at FROM catalog.model_providers ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list model providers: %w", err)
	}
	defer rows.Close()

	var items []models.ModelProvider
	for rows.Next() {
		var item models.ModelProvider
		var config []byte
		if err := rows.Scan(&item.ID, &item.Name, &item.AdapterKey, &item.Enabled, &config, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan model provider: %w", err)
		}
		item.Config = mapFromJSON(config)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) ListModelDefinitions(ctx context.Context) ([]models.ModelDefinition, error) {
	rows, err := s.db.Query(ctx, `
SELECT id::text, provider_id::text, model_name, display_name, capabilities, cost_config, enabled, is_default, created_at
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
       COALESCE(status_rollup.status, 'pending')
FROM execution.batches
LEFT JOIN LATERAL (
  SELECT execution.compute_batch_status(array_agg(iterations.status)) AS status
  FROM execution.executions
  JOIN execution.iterations ON iterations.execution_id = executions.id
  WHERE executions.batch_id = batches.id
) status_rollup ON true
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
	gyms, tasks, modelsByID, err := s.snapshotCatalog(ctx, batchID)
	if err != nil {
		return models.BatchSnapshot{}, err
	}

	counts := map[string]int{"total": len(iterations)}
	for _, iteration := range iterations {
		counts[iteration.Status]++
	}

	return models.BatchSnapshot{
		Batch:      batch,
		Executions: executions,
		Iterations: iterations,
		Counts:     counts,
		Report:     map[string]any{"status": "not_configured"},
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
	if err := row.Scan(&task.ID, &task.GymID, &task.TaskID, &task.Prompt, &graderConfig, &simulatorConfig, &dbJSONValidator, &task.VerifierPath, &importMetadata, &exportMetadata, &task.CreatedAt, &task.UpdatedAt); err != nil {
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

func scanModelDefinition(row scanner) (models.ModelDefinition, error) {
	var item models.ModelDefinition
	var capabilities, costConfig []byte
	if err := row.Scan(&item.ID, &item.ProviderID, &item.ModelName, &item.DisplayName, &capabilities, &costConfig, &item.Enabled, &item.IsDefault, &item.CreatedAt); err != nil {
		return models.ModelDefinition{}, fmt.Errorf("scan model definition: %w", err)
	}
	item.Capabilities = mapFromJSON(capabilities)
	item.CostConfig = mapFromJSON(costConfig)
	return item, nil
}

func scanBatch(row scanner) (models.Batch, error) {
	var batch models.Batch
	if err := row.Scan(&batch.ID, &batch.Name, &batch.GymID, &batch.CreatedBy, &batch.IterationCount, &batch.RerunEnabled, &batch.NotificationRead, &batch.CreatedAt, &batch.Status); err != nil {
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
       COALESCE(status_rollup.status, 'pending')
FROM execution.batches
LEFT JOIN LATERAL (
  SELECT execution.compute_batch_status(array_agg(iterations.status)) AS status
  FROM execution.executions
  JOIN execution.iterations ON iterations.execution_id = executions.id
  WHERE executions.batch_id = batches.id
) status_rollup ON true
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
       iterations.result_data,
       iterations.total_steps, iterations.created_at
FROM execution.iterations
JOIN execution.executions ON executions.id = iterations.execution_id
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
			&resultData,
			&iteration.TotalSteps,
			&iteration.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan iteration: %w", err)
		}
		iteration.ResultData = mapFromJSON(resultData)
		iterations = append(iterations, iteration)
	}
	return iterations, rows.Err()
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
       tasks.export_metadata, tasks.created_at, tasks.updated_at
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
       models.capabilities, models.cost_config, models.enabled, models.is_default, models.created_at
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
