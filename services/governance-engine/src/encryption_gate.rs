use crate::types::{FieldError, HardRuleCheckRequest};

/// WO-12: EncryptionGateService — encrypt-before-access for PHI
pub struct EncryptionGateService;

impl EncryptionGateService {
    pub fn check(request: &HardRuleCheckRequest) -> Option<FieldError> {
        if request.touches_phi && !request.encryption_layer_present {
            Some(FieldError {
                field: "encryptionLayerPresent".into(),
                code: "ENCRYPT_BEFORE_ACCESS".into(),
                message: "Protected health data requires encryption layer before agent access".into(),
            })
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{AgentRight, HardRuleCheckRequest};
    use uuid::Uuid;

    fn base_request() -> HardRuleCheckRequest {
        HardRuleCheckRequest {
            agent_id: "agent-1".into(),
            entity_id: Uuid::new_v4().to_string(),
            vertical: "rareangels".into(),
            requested_rights: vec![AgentRight::SensitiveData],
            touches_phi: false,
            touches_financial: false,
            encryption_layer_present: true,
            human_instruction_id: None,
        }
    }

    #[test]
    fn allows_phi_when_encryption_present() {
        let mut req = base_request();
        req.touches_phi = true;
        req.encryption_layer_present = true;
        assert!(EncryptionGateService::check(&req).is_none());
    }

    #[test]
    fn blocks_phi_without_encryption() {
        let mut req = base_request();
        req.touches_phi = true;
        req.encryption_layer_present = false;
        let err = EncryptionGateService::check(&req).expect("expected block");
        assert_eq!(err.code, "ENCRYPT_BEFORE_ACCESS");
    }
}
