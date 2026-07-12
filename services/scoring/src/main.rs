use axum::{
    extract::{Json, Request},
    http::StatusCode,
    middleware::{from_fn, Next},
    response::Response,
    routing::{get, post},
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use uuid::Uuid;
mod anchored_assessment;
use anchored_assessment::{
    compute_anchored_assessment, AnchoredAssessmentRequest, AnchoredAssessmentResult,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreDimension {
    pub name: String,
    pub value: f64,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreRequest {
    pub entity_id: String,
    pub vertical: String,
    pub dimensions: Vec<ScoreDimension>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreResult {
    pub entity_id: String,
    pub vertical: String,
    pub total_score: f64,
    pub pillar_scores: Vec<ScoreDimension>,
    pub computed_at: String,
    pub trace_id: String,
}

/// WO-16: Deterministic ScoringEngine
pub struct ScoringEngine;

impl ScoringEngine {
    pub fn compute(request: &ScoreRequest) -> ScoreResult {
        let mut total = 0.0f64;
        let mut weight_sum = 0.0f64;
        let mut pillars = Vec::new();

        for dim in &request.dimensions {
            let weighted = dim.value * dim.weight;
            total += weighted;
            weight_sum += dim.weight;
            pillars.push(ScoreDimension {
                name: dim.name.clone(),
                value: dim.value,
                weight: dim.weight,
            });
        }

        let total_score = if weight_sum > 0.0 {
            (total / weight_sum).clamp(0.0, 100.0)
        } else {
            0.0
        };

        ScoreResult {
            entity_id: request.entity_id.clone(),
            vertical: request.vertical.clone(),
            total_score,
            pillar_scores: pillars,
            computed_at: Utc::now().to_rfc3339(),
            trace_id: Uuid::new_v4().to_string(),
        }
    }
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    service: String,
    timestamp: String,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        service: "scoring".into(),
        timestamp: Utc::now().to_rfc3339(),
    })
}

async fn score(Json(request): Json<ScoreRequest>) -> Json<ScoreResult> {
    Json(ScoringEngine::compute(&request))
}

async fn anchored(Json(request): Json<AnchoredAssessmentRequest>) -> Json<AnchoredAssessmentResult> {
    Json(compute_anchored_assessment(&request))
}

/// Reads INTERNAL_SERVICE_TOKEN, or INTERNAL_SERVICE_TOKEN_FILE (Docker/K8s secrets pattern).
fn read_internal_service_token() -> String {
    if let Ok(path) = std::env::var("INTERNAL_SERVICE_TOKEN_FILE") {
        if let Ok(contents) = std::fs::read_to_string(&path) {
            let trimmed = contents.trim().to_string();
            if !trimmed.is_empty() {
                return trimmed;
            }
        }
    }
    std::env::var("INTERNAL_SERVICE_TOKEN").unwrap_or_default()
}

fn is_strict_posture() -> bool {
    let strict_mode = std::env::var("AUTH_TRUST_MODE")
        .map(|v| v.eq_ignore_ascii_case("strict"))
        .unwrap_or(false);
    let require_flag = std::env::var("REQUIRE_INTERNAL_RPC_AUTH")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    strict_mode || require_flag
}

/// When INTERNAL_SERVICE_TOKEN (or _FILE) is set, require matching x-internal-service-token
/// on /rpc/*. /health stays open. When unset: fail-closed (503) under AUTH_TRUST_MODE=strict
/// or REQUIRE_INTERNAL_RPC_AUTH=1; otherwise allow (local demos / unit tests).
async fn require_internal_service_token(req: Request, next: Next) -> Result<Response, StatusCode> {
    if req.uri().path() == "/health" {
        return Ok(next.run(req).await);
    }
    let expected = read_internal_service_token();
    if expected.is_empty() {
        if is_strict_posture() {
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
        return Ok(next.run(req).await);
    }
    let provided = req
        .headers()
        .get("x-internal-service-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if provided == expected {
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request as HttpRequest;
    use std::sync::{Mutex as StdMutex, MutexGuard, OnceLock};
    use tower::ServiceExt;

    /// Tests below mutate process-wide env vars (INTERNAL_SERVICE_TOKEN, AUTH_TRUST_MODE).
    /// Serialize them within this binary so parallel test threads cannot race each other.
    fn env_lock() -> MutexGuard<'static, ()> {
        static LOCK: OnceLock<StdMutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| StdMutex::new(())).lock().unwrap_or_else(|e| e.into_inner())
    }

    fn clear_internal_rpc_env() {
        std::env::remove_var("INTERNAL_SERVICE_TOKEN");
        std::env::remove_var("INTERNAL_SERVICE_TOKEN_FILE");
        std::env::remove_var("AUTH_TRUST_MODE");
        std::env::remove_var("REQUIRE_INTERNAL_RPC_AUTH");
    }

    #[test]
    fn scoring_is_deterministic_for_same_inputs() {
        let req = ScoreRequest {
            entity_id: "e1".into(),
            vertical: "rarestorm".into(),
            dimensions: vec![
                ScoreDimension { name: "governance".into(), value: 80.0, weight: 1.0 },
                ScoreDimension { name: "readiness".into(), value: 60.0, weight: 1.0 },
            ],
        };
        let a = ScoringEngine::compute(&req);
        let b = ScoringEngine::compute(&req);
        assert_eq!(a.total_score, b.total_score);
        assert_eq!(a.total_score, 70.0);
    }

    fn build_test_router() -> Router {
        Router::new()
            .route("/health", get(health))
            .route("/rpc/score", post(score))
            .layer(from_fn(require_internal_service_token))
    }

    #[tokio::test]
    async fn health_stays_open_without_token() {
        let _guard = env_lock();
        clear_internal_rpc_env();
        let response = build_test_router()
            .oneshot(HttpRequest::builder().uri("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn rpc_fails_closed_when_strict_and_no_token_configured() {
        let _guard = env_lock();
        clear_internal_rpc_env();
        std::env::set_var("AUTH_TRUST_MODE", "strict");
        let response = build_test_router()
            .oneshot(
                HttpRequest::builder()
                    .method("POST")
                    .uri("/rpc/score")
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        clear_internal_rpc_env();
    }

    #[tokio::test]
    async fn rpc_rejects_missing_token_when_configured() {
        let _guard = env_lock();
        clear_internal_rpc_env();
        std::env::set_var("INTERNAL_SERVICE_TOKEN", "test-secret");
        let response = build_test_router()
            .oneshot(
                HttpRequest::builder()
                    .method("POST")
                    .uri("/rpc/score")
                    .header("content-type", "application/json")
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        std::env::remove_var("INTERNAL_SERVICE_TOKEN");
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let app = Router::new()
        .route("/health", get(health))
        .route("/rpc/score", post(score))
        .route("/rpc/anchored", post(anchored))
        .layer(from_fn(require_internal_service_token));

    let port: u16 = std::env::var("SCORING_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3003);

    // Fail-closed private bind: default to loopback-only. Set SCORING_HOST to bind
    // elsewhere (e.g. behind a private network/VPN), matching the API fortress posture.
    let host: std::net::IpAddr = std::env::var("SCORING_HOST")
        .ok()
        .and_then(|h| h.parse().ok())
        .unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1)));

    let addr = SocketAddr::from((host, port));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    tracing::info!("Scoring Engine listening on {}", addr);
    axum::serve(listener, app).await.unwrap();
}
