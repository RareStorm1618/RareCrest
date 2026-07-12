use crate::runtime_enforcement::{ActivationRequest, RuntimeEnforcementService};
use crate::types::{HardRuleCheckRequest, HardRuleVerdict, HealthResponse};
use axum::{
    extract::{Json, State},
    routing::{get, post},
    Router,
};
use chrono::Utc;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod hard_rule_evaluator;
mod kill_switch_controller;
mod runtime_enforcement;
mod types;
use kill_switch_controller::{KillSwitchArmRequest, KillSwitchController, KillSwitchTriggerRequest, KillSwitchVerdict};

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
    let verdict = RuntimeEnforcementService::enforce_action(&request);
    Json(verdict)
}

async fn runtime_activate(Json(request): Json<ActivationRequest>) -> Json<crate::runtime_enforcement::ActivationVerdict> {
    Json(RuntimeEnforcementService::evaluate_activation(&request))
}

async fn kill_switch_arm(
    State(controller): State<Arc<Mutex<KillSwitchController>>>,
    Json(request): Json<KillSwitchArmRequest>,
) -> Json<KillSwitchVerdict> {
    let mut guard = controller.lock().expect("kill switch mutex poisoned");
    Json(guard.arm(&request))
}

async fn kill_switch_trigger(
    State(controller): State<Arc<Mutex<KillSwitchController>>>,
    Json(request): Json<KillSwitchTriggerRequest>,
) -> Json<KillSwitchVerdict> {
    let mut guard = controller.lock().expect("kill switch mutex poisoned");
    Json(guard.trigger(&request))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();

    let kill_switch = Arc::new(Mutex::new(KillSwitchController::default()));
    let app = Router::new()
        .route("/health", get(health))
        .route("/rpc/hard-rule-check", post(hard_rule_check))
        .route("/rpc/runtime/activate", post(runtime_activate))
        .route("/rpc/kill-switch/arm", post(kill_switch_arm))
        .route("/rpc/kill-switch/trigger", post(kill_switch_trigger))
        .with_state(kill_switch);

    let port: u16 = std::env::var("GOVERNANCE_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Governance Engine listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
