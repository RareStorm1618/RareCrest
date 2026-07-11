use crate::hard_rule_evaluator::HardRuleEvaluator;
use crate::types::{HardRuleCheckRequest, HardRuleVerdict, HealthResponse};
use axum::{
    extract::Json,
    http::StatusCode,
    routing::{get, post},
    Router,
};
use chrono::Utc;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod hard_rule_evaluator;
mod types;

/// WO-12: EncryptionGateService
pub struct EncryptionGateService;

impl EncryptionGateService {
    pub fn check(request: &HardRuleCheckRequest) -> Option<crate::types::FieldError> {
        if request.touches_phi && !request.encryption_layer_present {
            Some(crate::types::FieldError {
                field: "encryptionLayerPresent".into(),
                code: "ENCRYPT_BEFORE_ACCESS".into(),
                message: "Encryption layer must be present before PHI access".into(),
            })
        } else {
            None
        }
    }
}

/// WO-13: DeploymentGateService
pub struct DeploymentGateService;

impl DeploymentGateService {
    pub fn check_maturity_floor(maturity_score: u8, threshold: u8) -> bool {
        maturity_score >= threshold
    }

    pub fn check_migration_red_halt(migration_blocked: bool) -> bool {
        !migration_blocked
    }
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        service: "governance-engine".into(),
        timestamp: Utc::now().to_rfc3339(),
    })
}

async fn hard_rule_check(Json(request): Json<HardRuleCheckRequest>) -> Json<HardRuleVerdict> {
    // Encryption gate check (WO-12) integrated into evaluator
    let verdict = HardRuleEvaluator::evaluate(&request);
    Json(verdict)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();

    let app = Router::new()
        .route("/health", get(health))
        .route("/rpc/hard-rule-check", post(hard_rule_check));

    let port: u16 = std::env::var("GOVERNANCE_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Governance Engine listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
