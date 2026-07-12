use axum::{extract::Json, routing::{get, post}, Router};
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

#[cfg(test)]
mod tests {
    use super::*;

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
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let app = Router::new()
        .route("/health", get(health))
        .route("/rpc/score", post(score))
        .route("/rpc/anchored", post(anchored));

    let port: u16 = std::env::var("SCORING_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3003);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    tracing::info!("Scoring Engine listening on {}", addr);
    axum::serve(listener, app).await.unwrap();
}
