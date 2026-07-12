use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnchoredDimension {
    pub name: String,
    pub baseline: f64,
    pub current: f64,
    pub target: f64,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnchoredAssessmentRequest {
    pub entity_id: String,
    pub vertical: String,
    pub dimensions: Vec<AnchoredDimension>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnchoredAssessmentResult {
    pub entity_id: String,
    pub vertical: String,
    pub anchored_score: f64,
    pub progress_ratio: f64,
    pub weak_dimensions: Vec<String>,
    pub computed_at: String,
    pub trace_id: String,
}

fn clamped_progress(dimension: &AnchoredDimension) -> f64 {
    let denominator = dimension.target - dimension.baseline;
    if denominator.abs() < f64::EPSILON {
        return if dimension.current >= dimension.target { 1.0 } else { 0.0 };
    }
    ((dimension.current - dimension.baseline) / denominator).clamp(0.0, 1.0)
}

pub fn compute_anchored_assessment(
    request: &AnchoredAssessmentRequest,
) -> AnchoredAssessmentResult {
    let mut weighted_progress_sum = 0.0f64;
    let mut weight_sum = 0.0f64;
    let mut weak_dimensions = Vec::new();

    for dimension in &request.dimensions {
        let progress = clamped_progress(dimension);
        let weight = dimension.weight.max(0.0);
        weighted_progress_sum += progress * weight;
        weight_sum += weight;

        if progress < 0.5 {
            weak_dimensions.push(dimension.name.clone());
        }
    }

    let progress_ratio = if weight_sum > 0.0 {
        weighted_progress_sum / weight_sum
    } else {
        0.0
    };

    AnchoredAssessmentResult {
        entity_id: request.entity_id.clone(),
        vertical: request.vertical.clone(),
        anchored_score: (progress_ratio * 100.0).round(),
        progress_ratio,
        weak_dimensions,
        computed_at: Utc::now().to_rfc3339(),
        trace_id: Uuid::new_v4().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_weighted_progress_and_flags_weak_dimensions() {
        let result = compute_anchored_assessment(&AnchoredAssessmentRequest {
            entity_id: "e1".to_string(),
            vertical: "rarestorm".to_string(),
            dimensions: vec![
                AnchoredDimension {
                    name: "governance".to_string(),
                    baseline: 20.0,
                    current: 50.0,
                    target: 80.0,
                    weight: 2.0,
                },
                AnchoredDimension {
                    name: "ops".to_string(),
                    baseline: 10.0,
                    current: 20.0,
                    target: 70.0,
                    weight: 1.0,
                },
            ],
        });

        assert!(result.anchored_score > 0.0);
        assert!(result.weak_dimensions.contains(&"ops".to_string()));
    }

    #[test]
    fn handles_zero_weight_without_panicking() {
        let result = compute_anchored_assessment(&AnchoredAssessmentRequest {
            entity_id: "e1".to_string(),
            vertical: "rarestorm".to_string(),
            dimensions: vec![AnchoredDimension {
                name: "governance".to_string(),
                baseline: 0.0,
                current: 0.0,
                target: 100.0,
                weight: 0.0,
            }],
        });

        assert_eq!(result.anchored_score, 0.0);
        assert_eq!(result.progress_ratio, 0.0);
    }
}
