import { PrismaClient, UserStatus, KYCStatus, FindingCategory, FindingSeverity } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.ALLOW_SEED !== 'true') {
    console.error('❌ SEED ABORTED: Set ALLOW_SEED=true in your environment to proceed.');
    process.exit(1);
  }

  console.log('🚀 Institutional Seeding Initialized [NIB BANK BLUEPRINT]...');

  // 1. Provision Permission Registry
  const permissions = [
    // DASHBOARD
    { slug: 'DASHBOARD_VIEW', name: 'View General Dashboard', group: 'DASHBOARD' },
    { slug: 'DASHBOARD_VIEW_BRANCH', name: 'View Branch Specific Dashboard', group: 'DASHBOARD' },
    { slug: 'DASHBOARD_VIEW_DISTRICT', name: 'View District Specific Dashboard', group: 'DASHBOARD' },
    { slug: 'DASHBOARD_VIEW_SYSTEM', name: 'View System-wide Command Dashboard', group: 'DASHBOARD' },

    // WORKFLOWS
    { slug: 'CASE_UPLOAD_DOCUMENT', name: 'Upload Customer Documents', group: 'WORKFLOWS' },
    { slug: 'CASE_SUBMIT', name: 'Submit New KYC Case', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_OWN', name: 'View Own Submissions', group: 'WORKFLOWS' },
    { slug: 'CASE_RESUBMIT', name: 'Resubmit Corrected Case', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_ACTION_REQUIRED', name: 'View Amendment Requests', group: 'WORKFLOWS' },
    { slug: 'CASE_RESPOND_AMENDMENT', name: 'Respond to Amendments', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_BRANCH', name: 'View All Branch Cases', group: 'WORKFLOWS' },
    { slug: 'KYC_VIEW_QUEUE', name: 'View Review Queue', group: 'WORKFLOWS' },
    { slug: 'KYC_VERIFY_CHECKLIST', name: 'Perform Verification', group: 'WORKFLOWS' },
    { slug: 'KYC_REQUEST_AMENDMENT', name: 'Request Case Amendments', group: 'WORKFLOWS' },
    { slug: 'KYC_APPROVE_STANDARD', name: 'Approve Standard Cases', group: 'WORKFLOWS' },
    { slug: 'VIEW_ESCALATED_CASES', name: 'View Escalation Queue', group: 'WORKFLOWS' },
    { slug: 'VIEW_GOVERNANCE_QUEUE', name: 'View Exceptional Queue', group: 'WORKFLOWS' },
    { slug: 'TRIGGER_GOVERNANCE_FLOW', name: 'Trigger Exceptional Flow', group: 'WORKFLOWS' },
    { slug: 'VIEW_ARCHIVED_CASE', name: 'View Master Archive', group: 'WORKFLOWS' },
    
    // REFERENCE
    { slug: 'VIEW_FQ_LIBRARY', name: 'View F&Q Library', group: 'REFERENCE' },
    { slug: 'CREATE_FQ_ENTRY', name: 'Create F&Q Entry', group: 'REFERENCE' },
    
    // REPORTING
    { slug: 'REPORT_VIEW_SYSTEM', name: 'View System-wide Reports', group: 'REPORTING' },
    { slug: 'REPORT_VIEW_DISTRICT', name: 'View District Command', group: 'REPORTING' },
    { slug: 'VIEW_SPECIALIST_PRODUCTIVITY', name: 'View Specialist Matrix', group: 'REPORTING' },
    { slug: 'VIEW_AUDIT_POOL', name: 'View Audit Pool', group: 'REPORTING' },
    { slug: 'VIEW_AUDIT_LOGS', name: 'View Audit Logs', group: 'REPORTING' },
    { slug: 'DOWNLOAD_MASTER_ARCHIVE', name: 'Download Master Archive', group: 'REPORTING' },

    // SYSTEM
    { slug: 'USER_CREATE', name: 'Provision New Users', group: 'SYSTEM' },
    { slug: 'ROLE_CREATE', name: 'Define New Role', group: 'SYSTEM' },
    { slug: 'MAP_USERS_TO_BRANCH', name: 'Link Users to Nodes', group: 'SYSTEM' },
    { slug: 'MANAGE_BRANCHES', name: 'Manage Branches', group: 'SYSTEM' },
    { slug: 'EDIT_SLA_POLICY', name: 'Modify Institutional SLA', group: 'SYSTEM' },
    { slug: 'VIEW_SYSTEM_AUDIT', name: 'View Master Audit Log', group: 'SYSTEM' },
  ];

  const permMap: Record<string, string> = {};
  for (const p of permissions) {
    const created = await prisma.permission.upsert({
      where: { slug: p.slug },
      update: { name: p.name, group: p.group },
      create: p,
    });
    permMap[p.slug] = created.id;
  }

  // 2. Institutional Roles
  const roles = [
    { name: 'SUPER_ADMIN', description: 'Master Control & Global Oversight' },
    { name: 'DISTRICT_DIRECTOR', description: 'Regional Command & Governance' },
    { name: 'KYC_DIRECTOR', description: 'Strategic Risk & Methodology Oversight' },
    { name: 'BRANCH_MANAGER', description: 'Local Node Operations Head' },
    { name: 'BRANCH_OFFICER', description: 'Primary Submission & Correction' },
    { name: 'KYC_OFFICER', description: 'Technical Analysis & Verification' },
    { name: 'SUPERVISOR', description: 'Operational Audit & Team Lead' },
  ];

  const roleMap: Record<string, any> = {};
  for (const r of roles) {
    roleMap[r.name] = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });
  }

  // 3. Right Mappings (Sync with Sidebar expectations)
  const rolePermissions: Record<string, string[]> = {
    BRANCH_OFFICER: ['DASHBOARD_VIEW', 'CASE_SUBMIT', 'CASE_VIEW_OWN', 'CASE_UPLOAD_DOCUMENT', 'CASE_RESUBMIT', 'CASE_RESPOND_AMENDMENT', 'VIEW_FQ_LIBRARY'],
    KYC_OFFICER: ['DASHBOARD_VIEW', 'KYC_VIEW_QUEUE', 'KYC_VERIFY_CHECKLIST', 'KYC_REQUEST_AMENDMENT', 'KYC_APPROVE_STANDARD', 'VIEW_FQ_LIBRARY', 'VIEW_SPECIALIST_PRODUCTIVITY'],
    SUPERVISOR: ['DASHBOARD_VIEW', 'KYC_VIEW_QUEUE', 'KYC_APPROVE_STANDARD', 'VIEW_ESCALATED_CASES', 'VIEW_SPECIALIST_PRODUCTIVITY', 'VIEW_FQ_LIBRARY'],
    BRANCH_MANAGER: ['DASHBOARD_VIEW', 'CASE_VIEW_BRANCH', 'DASHBOARD_VIEW_BRANCH', 'VIEW_FQ_LIBRARY', 'VIEW_GOVERNANCE_QUEUE', 'TRIGGER_GOVERNANCE_FLOW'],
    DISTRICT_DIRECTOR: ['DASHBOARD_VIEW', 'DASHBOARD_VIEW_DISTRICT', 'REPORT_VIEW_DISTRICT', 'CASE_VIEW_BRANCH', 'VIEW_FQ_LIBRARY', 'VIEW_GOVERNANCE_QUEUE', 'TRIGGER_GOVERNANCE_FLOW', 'VIEW_SPECIALIST_PRODUCTIVITY'],
    KYC_DIRECTOR: ['DASHBOARD_VIEW', 'DASHBOARD_VIEW_SYSTEM', 'REPORT_VIEW_SYSTEM', 'VIEW_FQ_LIBRARY', 'VIEW_GOVERNANCE_QUEUE', 'TRIGGER_GOVERNANCE_FLOW', 'VIEW_SPECIALIST_PRODUCTIVITY']
  };

  for (const [roleName, slugs] of Object.entries(rolePermissions)) {
    const roleId = roleMap[roleName].id;
    for (const slug of slugs) {
      if (permMap[slug]) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: permMap[slug] } },
          update: {},
          create: { roleId, permissionId: permMap[slug] }
        });
      }
    }
  }

  // 4. Institutional Hierarchy (Districts & Branches)
  const districts = [
    { name: 'Addis Central', branches: ['Meskel Square', 'Stadium', 'Kazanchis'] },
    { name: 'Addis North', branches: ['Bole', 'Megenagna', 'Arat Kilo'] },
    { name: 'Southern Hub', branches: ['Hawassa Node', 'Arba Minch'] }
  ];

  const branchNodes: any[] = [];
  for (const d of districts) {
    const dist = await prisma.district.upsert({
      where: { name: d.name },
      update: {},
      create: { name: d.name }
    });

    for (const bName of d.branches) {
      const branch = await prisma.branch.upsert({
        where: { name: bName },
        update: {},
        create: { 
          name: bName, 
          code: `BR-${Math.floor(100 + Math.random() * 900)}`, 
          districtId: dist.id 
        }
      });
      branchNodes.push(branch);
    }
  }

  // 5. Personnel Seeding
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'nibbank123';
  const hashedPass = await bcrypt.hash(adminPass, 10);

  const testUsers = [
    { email: 'admin.nib@nibbank.com.et', first: 'System', last: 'Admin', role: 'SUPER_ADMIN', branch: null },
    { email: 'director.central@nibbank.com.et', first: 'Abebe', last: 'Bikila', role: 'DISTRICT_DIRECTOR', branch: null },
    { email: 'manager.meskel@nibbank.com.et', first: 'Derartu', last: 'Tulu', role: 'BRANCH_MANAGER', branch: 'Meskel Square' },
    { email: 'officer.meskel@nibbank.com.et', first: 'Fatuma', last: 'Roba', role: 'BRANCH_OFFICER', branch: 'Meskel Square' },
    { email: 'specialist.nib@nibbank.com.et', first: 'Meseret', last: 'Defar', role: 'KYC_OFFICER', branch: null, portfolio: ['Meskel Square', 'Stadium'] },
    { email: 'supervisor.nib@nibbank.com.et', first: 'Haile', last: 'Gebrselassie', role: 'SUPERVISOR', branch: null }
  ];

  for (const u of testUsers) {
    const branchId = u.branch ? branchNodes.find(b => b.name === u.branch)?.id : null;
    const firebaseUid = `uid-${u.email.split('@')[0]}`;
    
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { 
        passwordHash: hashedPass, 
        firebaseUid,
        branchId,
        assignedBranches: u.portfolio || []
      },
      create: {
        id: firebaseUid,
        firebaseUid,
        email: u.email,
        firstName: u.first,
        lastName: u.last,
        status: UserStatus.ACTIVE,
        passwordHash: hashedPass,
        branchId,
        assignedBranches: u.portfolio || []
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleMap[u.role].id } },
      update: {},
      create: { userId: user.id, roleId: roleMap[u.role].id },
    });
  }

  // 6. Sample Submission Data
  const meskelBranch = branchNodes.find(b => b.name === 'Meskel Square');
  if (meskelBranch) {
    const samples = [
      { id: 'MESKEL-KYC-1001', name: 'Tekle Giyorgis', status: KYCStatus.APPROVED, type: 'Individual' },
      { id: 'MESKEL-KYC-1002', name: 'Blue Nile Construction', status: KYCStatus.IN_REVIEW, type: 'Company' },
      { id: 'MESKEL-KYC-1003', name: 'Zewditu Solomon', status: KYCStatus.ACTION_REQUIRED, type: 'Individual', cycles: 1 },
      { id: 'STADIUM-KYC-2001', name: 'Awash Winery PLC', status: KYCStatus.ESCALATED, type: 'Company', exceptional: true, excStatus: 'AWAITING_DIRECTOR' }
    ];

    const officer = await prisma.user.findFirst({ where: { email: 'officer.meskel@nibbank.com.et' } });
    const specialist = await prisma.user.findFirst({ where: { email: 'specialist.nib@nibbank.com.et' } });

    for (const s of samples) {
      await prisma.kYC.upsert({
        where: { id: s.id },
        update: {},
        create: {
          id: s.id,
          customerName: s.name,
          status: s.status,
          entityType: s.type,
          branchId: meskelBranch.id,
          branchName: meskelBranch.name,
          createdById: officer!.id,
          assignedToId: specialist!.id,
          amendCycles: s.cycles || 0,
          isExceptional: s.exceptional || false,
          exceptionalStatus: s.excStatus || 'None',
          commentHistory: [
            { role: 'BRANCH_OFFICER', performedBy: officer!.firstName, timestamp: new Date().toISOString(), comment: 'Initial deployment.', action: 'SUBMIT' }
          ]
        }
      });
    }
  }

  // 7. Methodology Registry (Findings)
  const findings = [
    { code: 'FQ-101', title: 'CID Authorization missing', category: FindingCategory.COMPLIANCE, severity: FindingSeverity.HIGH, desc: 'The Customer Identification data has not been authorized in the core banking system.' },
    { code: 'FQ-102', title: 'Trade License Expiry', category: FindingCategory.DOCUMENTATION, severity: FindingSeverity.CRITICAL, desc: 'The business trade license is not renewed for the current fiscal year.' }
  ];

  for (const f of findings) {
    await prisma.finding.upsert({
      where: { code: f.code },
      update: {},
      create: { 
        code: f.code, 
        title: f.title, 
        description: f.desc, 
        category: f.category, 
        severity: f.severity, 
        applicableTo: ['Individual', 'Company'] 
      }
    });
  }

  // 8. Global Settings Initialization
  await prisma.globalSetting.upsert({
    where: { id: 'global' },
    update: {},
    create: {
      id: 'global',
      autoEscalation: true,
      escalationHours: 72,
      strictSla: true,
      slaHours: 24,
      documentTypes: [
        { id: 'id_card', label: 'National ID' },
        { id: 'passport', label: 'Passport' },
        { id: 'license', label: 'Trade License' }
      ],
      entityTypes: [
        { id: 'individual', label: 'Individual Account' },
        { id: 'company', label: 'Company Account' }
      ],
      guidelines: [
        { id: 'g1', title: 'NBE 2024 Mandate', type: 'alert', description: 'Strict verification of MOA/AOA required for all corporate accounts.' }
      ]
    }
  });

  console.log('✅ Institutional Vault established. Personnel mapped. Monitoring history generated.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
