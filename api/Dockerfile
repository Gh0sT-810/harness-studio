FROM golang:1.26.2-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/harness-api ./cmd/api

FROM alpine:3.22

RUN addgroup -S harness && adduser -S harness -G harness

WORKDIR /app
COPY --from=build /out/harness-api /app/harness-api

USER harness
EXPOSE 8080

CMD ["/app/harness-api"]
