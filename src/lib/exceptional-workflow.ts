import { EXCEPTIONAL_STATUS, ExceptionalStatus } from './kyc-data';

export type ExceptionalWorkflowAction = {
  nextStatus: ExceptionalStatus;
  label: string;
  actionType: 'APPROVE' | 'RETURN' | 'FORWARD' | 'COMPLETE' | 'RESUBMIT';
  requiresMemo?: boolean;
  allowOptionalMemo?: boolean;
  requiresRemarks?: boolean;
};

export type ExceptionalWorkflowStage = {
  status: ExceptionalStatus;
  label: string;
  description: string;
  permission: string;
  actions: ExceptionalWorkflowAction[];
};

const EXCEPTIONAL_WORKFLOW_STAGES: Record<ExceptionalStatus, ExceptionalWorkflowStage> = {
  [EXCEPTIONAL_STATUS.AWAITING_DISTRICT]: {
    status: EXCEPTIONAL_STATUS.AWAITING_DISTRICT,
    label: 'District Director Review',
    description: 'Regional oversight and exceptional case review.',
    permission: 'DISTRICT_DIRECTOR_REVIEW',
    actions: [
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_DIRECTOR,
        label: 'Forward to KYC Director',
        actionType: 'FORWARD',
        requiresMemo: true,
        requiresRemarks: true,
      },
      {
        nextStatus: EXCEPTIONAL_STATUS.CLARIFICATION_REQUIRED,
        label: 'Return to Branch',
        actionType: 'RETURN',
        requiresRemarks: true,
      },
    ],
  },
  [EXCEPTIONAL_STATUS.AWAITING_DIRECTOR]: {
    status: EXCEPTIONAL_STATUS.AWAITING_DIRECTOR,
    label: 'KYC Director Approval',
    description: 'Review case details, attachments, and prior decisions.',
    permission: 'KYC_DIRECTOR_APPROVAL',
    actions: [
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_DIVISION,
        label: 'Approve and Forward to Division Manager',
        actionType: 'APPROVE',
        requiresMemo: true, // Default, will be overridden if coming from Chief
        requiresRemarks: true,
      },
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_CHIEF,
        label: 'Forward to Chief Retail & SME',
        actionType: 'FORWARD',
        requiresMemo: true,
        requiresRemarks: true,
      },
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_DISTRICT,
        label: 'Return to District Director',
        actionType: 'RETURN',
        requiresRemarks: true,
      },
    ],
  },
  [EXCEPTIONAL_STATUS.AWAITING_CHIEF]: {
    status: EXCEPTIONAL_STATUS.AWAITING_CHIEF,
    label: 'Chief Retail & SME Review',
    description: 'High-level review of exceptional approvals and recommendations.',
    permission: 'CHIEF_RETAIL_REVIEW',
    actions: [
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_DIRECTOR,
        label: 'Provide Decision to KYC Director',
        actionType: 'FORWARD',
        allowOptionalMemo: true,
        requiresRemarks: true,
      },
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_DIRECTOR,
        label: 'Return to KYC Director',
        actionType: 'RETURN',
        allowOptionalMemo: true,
        requiresRemarks: true,
      },
    ],
  },
  [EXCEPTIONAL_STATUS.AWAITING_DIVISION]: {
    status: EXCEPTIONAL_STATUS.AWAITING_DIVISION,
    label: 'Division Manager Review',
    description: 'Operational review and forwarding decision.',
    permission: 'DIVISION_MANAGER_REVIEW',
    actions: [
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_SUPERVISOR,
        label: 'Forward to Supervisor',
        actionType: 'FORWARD',
        requiresRemarks: true,
      },
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_DIRECTOR,
        label: 'Return to KYC Director',
        actionType: 'RETURN',
        requiresRemarks: true,
      },
    ],
  },
  [EXCEPTIONAL_STATUS.AWAITING_SUPERVISOR]: {
    status: EXCEPTIONAL_STATUS.AWAITING_SUPERVISOR,
    label: 'Supervisor Forward',
    description: 'Verify workflow completion and dispatch to KYC Officer.',
    permission: 'SUPERVISOR_FORWARD',
    actions: [
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_KYC_OFFICER,
        label: 'Forward to KYC Officer',
        actionType: 'FORWARD',
        requiresRemarks: true,
      },
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_DIVISION,
        label: 'Return to Division Manager',
        actionType: 'RETURN',
        requiresRemarks: true,
      },
    ],
  },
  [EXCEPTIONAL_STATUS.AWAITING_KYC_OFFICER]: {
    status: EXCEPTIONAL_STATUS.AWAITING_KYC_OFFICER,
    label: 'KYC Officer Processing',
    description: 'Final operational processing and case closure.',
    permission: 'KYC_OFFICER_PROCESS',
    actions: [
      {
        nextStatus: EXCEPTIONAL_STATUS.COMPLETED,
        label: 'Complete and Close Case',
        actionType: 'COMPLETE',
        requiresRemarks: true,
      },
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_SUPERVISOR,
        label: 'Return to Supervisor',
        actionType: 'RETURN',
        requiresRemarks: true,
      },
    ],
  },
  [EXCEPTIONAL_STATUS.COMPLETED]: {
    status: EXCEPTIONAL_STATUS.COMPLETED,
    label: 'KYC Officer Completion',
    description: 'Exceptional case closed and approved.',
    permission: 'KYC_OFFICER_PROCESS',
    actions: [],
  },
  [EXCEPTIONAL_STATUS.NONE]: {
    status: EXCEPTIONAL_STATUS.NONE,
    label: 'Not Exceptional',
    description: 'Case is not currently in the governance workflow.',
    permission: 'VIEW_ONLY_ACCESS',
    actions: [],
  },
  [EXCEPTIONAL_STATUS.CLARIFICATION_REQUIRED]: {
    status: EXCEPTIONAL_STATUS.CLARIFICATION_REQUIRED,
    label: 'Clarification Required',
    description: 'Returned to the branch for corrections and supporting documents.',
    permission: 'BRANCH_CASE_CREATE',
    actions: [
      {
        nextStatus: EXCEPTIONAL_STATUS.AWAITING_DISTRICT,
        label: 'Resubmit for District Review',
        actionType: 'RESUBMIT',
        requiresRemarks: true,
      },
    ],
  },
  [EXCEPTIONAL_STATUS.REJECTED]: {
    status: EXCEPTIONAL_STATUS.REJECTED,
    label: 'Rejected',
    description: 'Workflow rejected and case closed.',
    permission: 'VIEW_ONLY_ACCESS',
    actions: [],
  },
};

export const EXCEPTIONAL_WORKFLOW_ORDER: ExceptionalStatus[] = [
  EXCEPTIONAL_STATUS.AWAITING_DISTRICT,
  EXCEPTIONAL_STATUS.AWAITING_DIRECTOR,
  EXCEPTIONAL_STATUS.AWAITING_CHIEF,
  EXCEPTIONAL_STATUS.AWAITING_DIVISION,
  EXCEPTIONAL_STATUS.AWAITING_SUPERVISOR,
  EXCEPTIONAL_STATUS.AWAITING_KYC_OFFICER,
  EXCEPTIONAL_STATUS.COMPLETED,
];

export function getExceptionalWorkflowStage(status: string | null | undefined) {
  return EXCEPTIONAL_WORKFLOW_STAGES[status as ExceptionalStatus] || null;
}

export function getExceptionalWorkflowAction(stage: ExceptionalWorkflowStage, nextStatus: string) {
  return stage.actions.find((action) => action.nextStatus === nextStatus as ExceptionalStatus) || null;
}

export function getExceptionalWorkflowStages() {
  return EXCEPTIONAL_WORKFLOW_ORDER.map((status) => EXCEPTIONAL_WORKFLOW_STAGES[status]);
}

export function getActionsForCase(status: string | null | undefined, commentHistory: any[]) {
  const stage = getExceptionalWorkflowStage(status);
  if (!stage) return [];

  // Special logic for KYC Director Final Approval
  if (status === EXCEPTIONAL_STATUS.AWAITING_DIRECTOR) {
    const wasInChief = commentHistory.some(h => h.role === 'CHIEF_RETAIL_REVIEW' || h.action?.includes('CHIEF'));
    // Actually, checking previous status might be better if history is structured that way.
    // In our system, commentHistory records actions.
    
    if (wasInChief) {
      return stage.actions.map(action => {
        if (action.actionType === 'APPROVE') {
          return { ...action, requiresMemo: false };
        }
        return action;
      });
    }
  }

  return stage.actions;
}
