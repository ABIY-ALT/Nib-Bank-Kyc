
import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Institutional Seeding Initialized [NIB BANK]...');

  // 1. Provision Capabilities (Permissions)
  const permissions = [
    // DASHBOARD
    { slug: 'DASHBOARD_VIEW', name: 'View General Dashboard', group: 'DASHBOARD' },
    { slug: 'DASHBOARD_VIEW_SYSTEM', name: 'View System-wide Command Dashboard', group: 'DASHBOARD' },

    // WORKFLOWS - KYC Operations
    { slug: 'CASE_SUBMIT', name: 'Create New Submission', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_OWN', name: 'View My Submissions', group: 'WORKFLOWS' },
    { slug: 'KYC_VIEW_QUEUE', name: 'Access Review & Action', group: 'WORKFLOWS' },
    { slug: 'VIEW_AMENDMENT_QUEUE', name: 'Access Amendment Review', group: 'WORKFLOWS' },
    { slug: 'CASE_VIEW_ACTION_REQUIRED', name: 'View Returned Cases', group: 'WORKFLOWS' },
    { slug: 'VIEW_ESCALATED_CASES', name: 'View Escalated Cases', group: 'WORKFLOWS' },
    { slug: 'VIEW_GOVERNANCE_QUEUE', name: 'View Exceptional Cases', group: 'WORKFLOWS' },
    { slug: 'TRIGGER_GOVERNANCE_FLOW', name: 'Trigger Exceptional Flow', group: 'WORKFLOWS' },
    { slug: 'CASE_FLAG_URGENT', name: 'Flag Case as Urgent', group: 'WORKFLOWS' },
    
    // WORKFLOWS - Monitoring
    { slug: 'CASE_VIEW_BRANCH', name: 'Access Branch Monitoring', group: 'MONITORING' },
    { slug: 'DASHBOARD_VIEW_BRANCH', name: 'View Branch Specific Dashboard', group: 'MONITORING' },
    { slug: 'DASHBOARD_VIEW_DISTRICT_NODE', name: 'Access District Monitoring', group: 'MONITORING' },
    { slug: 'DASHBOARD_VIEW_DISTRICT', name: 'View District Dashboard', group: 'MONITORING' },
    
    // INFRASTRUCTURE
    { slug: 'MANAGE_VAULT_STORAGE', name: 'Manage Vault Storage', group: 'INFRASTRUCTURE' },
    { slug: 'VIEW_ARCHIVED_CASE', name: 'Access Case Archive', group: 'INFRASTRUCTURE' },
    { slug: 'EXPORT_CASE_ZIP', name: 'Download Case Bundle', group: 'INFRASTRUCTURE' },

    // REFERENCE
    { slug: 'VIEW_FQ_LIBRARY', name: 'View F&Q Library', group: 'REFERENCE' },
    { slug: 'CREATE_FQ_ENTRY', name: 'Create F&Q Entry', group: 'REFERENCE' },
    
    // REPORTING
    { slug: 'VIEW_SPECIALIST_PRODUCTIVITY', name: 'View Ops Monitoring', group: 'REPORTING' },
    { slug: 'REPORT_VIEW_SYSTEM', name: 'View System-wide Reports', group: 'REPORTING' },
    { slug: 'VIEW_AUDIT_POOL', name: 'Access Follow-up Audit', group: 'REPORTING' },
    { slug: 'VIEW_AUDIT_LOGS', name: 'View Audit Reports', group: 'REPORTING' },
    { slug: 'DOWNLOAD_MASTER_ARCHIVE', name: 'Download Master Archive', group: 'REPORTING' },

    // SYSTEM
    { slug: 'USER_CREATE', name: 'Manage User Access', group: 'SYSTEM' },
    { slug: 'ROLE_CREATE', name: 'Manage Assign Roles', group: 'SYSTEM' },
    { slug: 'MAP_USERS_TO_BRANCH', name: 'Manage Portfolio Mapping', group: 'SYSTEM' },
    { slug: 'MANAGE_BRANCHES', name: 'Manage Hierarchy', group: 'SYSTEM' },
    { slug: 'EDIT_SLA_POLICY', name: 'Modify System Configuration', group: 'SYSTEM' },
    { slug: 'VIEW_SYSTEM_AUDIT', name: 'View System Audit Logs', group: 'SYSTEM' },
  ];

  const dbPermissions = [];
  for (const p of permissions) {
    const perm = await prisma.permission.upsert({
      where: { slug: p.slug },
      update: { name: p.name, group: p.group },
      create: p,
    });
    dbPermissions.push(perm);
  }

  // 2. Provision Roles
  const roles = [
    { name: 'SUPER_ADMIN', description: 'Master Control' },
    { name: 'KYC_OFFICER', description: 'Verification Staff' },
    { name: 'BRANCH_OFFICER', description: 'Branch Operations' },
  ];

  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });

    // 3. Link Permissions to Roles
    if (r.name === 'SUPER_ADMIN') {
      // Grant all permissions to Admin
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: dbPermissions.map(p => ({ roleId: role.id, permissionId: p.id }))
      });
    } else if (r.name === 'BRANCH_OFFICER') {
      // Grant specific permissions to Branch Officer
      const branchSlugs = ['DASHBOARD_VIEW', 'CASE_SUBMIT', 'CASE_VIEW_OWN', 'CASE_VIEW_ACTION_REQUIRED'];
      const branchPerms = dbPermissions.filter(p => branchSlugs.includes(p.slug));
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: branchPerms.map(p => ({ roleId: role.id, permissionId: p.id }))
      });
    }
  }

  // 4. Provision Branch and District Registry
  const districtBranches: Record<string, string[]> = {
    NAAD: ['Abakoran', 'Addisu Gebeya', 'Amist Kilo', 'Arada giorgis', 'Arat Killo Premium', 'Artist Mohamud Ahmed (Arada)', 'Atiklet Tera', 'Aware', 'Cathedral', 'Chilot', 'Churchil', 'Enqulal Fabrica', 'Ferensay Legasion', 'Gola', 'Gulele', 'H/Giorgis', 'Janmeda', 'Kazanchis', 'Kebena', 'Kotebe', 'Kotebe Gebeya', 'Nib Premium', 'Ras', 'Rufael', 'Sebara Babure', 'Senga tera', 'Sheger Menafesha', 'Shiro Meda', 'Shola Gebeya', 'Sholla', 'Sidest Killo', 'Stadium', 'T/Adebabay', 'Tigat', 'Wessen', 'Wuha Limat', 'Yeka (Engliz Embassy)', 'Yeka Abado', 'Fiche', 'Gebra Guracha', 'Sululta'],
    WAAD: ['Abinet', 'Abinet Adebabay', 'Adarash', 'Addis Ketema', 'Addisu Michael', 'Alem Bank', 'Alem Bank Tropical', 'Alert', 'Asfa Wossen', 'Asko', 'Ayertena', 'B/Abanefso', 'Bethel', 'Bethel Rom Sefer', 'Billal', 'Cinma Ras', "D'Afrique", 'Daremar Branch', 'Dubai Tera', 'Ehil Berenda', 'Geja Sefer', 'Kara Kore', 'Kolfe', 'Kolfe Atana Tera', 'Kolfe Efoyita', 'Kolfe Fetno Derash', 'Kolfe Taywan', 'Lideta', 'Lomi Meda', 'Mehal Merkato', 'Military Tera', 'Mirab Merkato', 'Mismar tera', 'NIB Halal Amin', 'NIB Halal Autobus Tera', 'Nib Halal Aysha', 'Nib Halal Emana', 'Nib Halal Kolfe Efoyta', 'Nib Halal Nur Mesgid', 'Nib Halal Taqwa', 'Raguel', 'Sefere Selam', 'Shera Tera', 'Sidamo Tera', 'T/Haimanot', 'Tana', 'Tatari', 'Tiret', 'Tor-Hayiloch', 'Yekake Wordwet', 'Abdi Nono', 'Ambo', 'Anfo', 'Burayu', 'Holeta', 'Melka Geferesa'],
    EAAD: ['Arabssa', 'Ayat 49 Mazoria', 'Ayat 72', 'Ayat Adebabay', 'Ayat Arabssa', 'Ayat Mall', 'Ayat-Tafo', 'Beshale', 'Bole 24', 'Bole Atlas', 'Bole Brass', 'Bole Chefe', 'Bole Eniredada', 'Bole M/Alem', 'Bole Stadium', 'CMC', 'Gerji Giorgis', 'Gerji Mebrat Haile', 'Goro', 'Gurd Shola', 'Hayahulet Mazoria', 'Hayahulet Megenanga', 'Imperial', 'Imperial Sport Acadamy', 'Jacros', 'Jacros Beshale', 'Kara Alo', 'Karamara', 'Lamberet', 'Main', 'Megenagna Athlete Derartu Tulu', 'Megenagna', 'Megenagna Gurd shola', 'Mehal Summit', 'Meri Loque', 'Moenco', 'Peacock', 'Sealite Mehret', 'Shala Area', 'Summit', 'Summit CMC Adebabay', 'Summit Figa', 'Urael', 'Yerer Ber', 'Atse Zerayakob', 'Debre Eba', 'Debrebirehan', 'Legetafo', 'Sheno'],
    SAAD: ['Africa Avenue', 'Akaki Gebeya', 'B/Gebreal', 'Beklobet', 'Bole', 'Bole Bulbula', 'Bole Bulbula Mariam Mazoria', 'Bole Jaefer Mesjid', 'Bole Michael', 'Bole Rwanda', 'Bulbula 93 Mazoria', 'Buna Board', 'Denbel Corporate Banking Center', 'Flamingo', 'Furi', 'Furi Adebabay', 'Gara Duba', 'Gelan Condominium', 'Gofa Gebriel', 'Gofa Mazoria', 'Gotera', 'Gotera Ibex', 'Hana Mariam', 'Jemo', 'Kality', 'Kality Menaharia', 'Kera Sar Bet', 'Kirkos', 'Lafto', 'Lebu Irtu', 'Lebu Muzica Sefer', 'Lebu', 'Mamokacha', 'Mechare', 'Mehal Lafto', 'Mekanissa', 'Mekanissa Kore', 'Mekenisa Michael', 'Meskel Flower', 'Nib Halal Gofa', 'Nifas Silk', 'Olympia', 'Salogora', 'Sarbet', 'Saris', 'Saris Abo', 'Saris Addisu Sefer', 'Sefera Atikilt tera', 'Temenja Yaze', 'Tulu Dimtu', 'Vatican', 'Wello Sefer', 'Zenebe Worq Gebeya', 'Alem Gena', 'Sebeta', 'Wechecha'],
    Hawassa: ['Adare', 'Adola Woyu', 'Aleta Chuko', 'Aleta Wondo', 'Arbaminch', 'Arbaminch Gebeya', 'Areb Sefer', 'Arsi Negele', 'Awasho', 'Birbir', 'Bore', 'Bule Hora', 'Daye', 'Dilla', 'Dilla Edget', 'Damota', 'Gedeb', 'Gelila', 'Gesuba', 'Harufa', 'Hawassa', 'Hawassa Alamura', 'Hawassa Atote', 'Hawassa Menaheria', 'Hawassa-Warka', 'Humbo', 'Jinka', 'Moyale sub branch', 'Negele Borena', 'Nib Halal Shashemene', 'Sawula', 'Selam Ber', 'Shakiso', 'Shashemene', 'Shashemene ODA', 'Shecha', 'Tabor', 'W/Sodo', 'W/sodo Menharia', 'Yabelo', 'Yirgachefe', 'Yirgalem'],
    Hossaena: ['Adillo Sub Branch', 'Angacha', 'Ansho (Duna Ketema)', 'Areka', 'Bele', 'Boditi', 'Bombe', 'Bonosha', 'Domboya', 'Doyogena', 'Durame', 'Fonko', 'Gimbichu', 'Hadero', 'Halaba Kulito', 'Homecho', 'Hossaena Batena', 'Hossaena Gebeya', 'Hossaena Meneharia', 'Hossana', 'Hossana Arada', 'Hossana Gombora', 'Lera', 'Mudula', 'Nib Halal Aman', 'Nib Halal Dalocha', 'Nib Halal Hakika (Werabe Duna)', 'Nib Halal Hossana', 'Nib Halal Kibet', 'Nib Halal Silte Mitto', 'Nib Halal Tora', 'Sankura', 'Shinshicho', 'Shone', 'Wachamo University Sub-Br', 'Werabe'],
    'Bahir Dar': ['Abay Mado', 'Adet Tera', 'Bahir Dar Gebeya', 'Bahir Dar Ghion', 'Bahir Dar Tana', 'Bahir Dar', 'Bichena', 'Dangila', 'Debre Markos Gebeya (Sub )', 'Debre tabor', 'Debremarkos', 'Dejene', 'Durbete', 'Enjibara', 'Fasilo', 'Finote Selam', 'Gondar', 'Gonder Maraki', 'Humera', 'M/Yohanns (Sub Branch )', 'Merawi', 'Mota', 'Nib Halal Bahir Dar Ramadan', 'Nifas Mewcha', 'Woreta'],
    'Dire Dawa': ['Afetesa', 'Aw-Bare', 'Aweday', 'Bedessa', 'Chiro', 'Dire Dawa', 'Gelemso', 'Harar', 'Harar Ras', 'Hirna', 'Jigjiga Shebele', 'Jijiga', 'Kefira', 'Kezira Main', 'Melka Rafu', 'Mideregenet (Harer)', 'Nib Halal Kezira', 'Sabian Gulit', 'Sabian Meskelegna', 'Togo Chale Sub Branch'],
    Jimma: ['Agaro', 'Aman (Sub Branch )', 'Assosa', 'Bambasi', 'Bedele', 'Beshishe (Sub branch)', 'Bonga', 'Chora', 'Dembidolo', 'Dima', 'Gambela', 'Gimbi', 'Jimma (050)', 'Jimma Abajifar', 'Jimma Menharia', 'Limu Genet', 'Meti', 'Mettu', 'Mizan', 'Nekemte', 'Nib Halal Areboch Tera', 'Tarecha', 'Tepi', 'Wacha'],
    Adama: ['Adama Boset', 'Adama Menaharia', 'Adama.', 'Adda Bishoftu', 'Arerti', 'Asela', 'Awash 7 Killo', 'Bale Robe', 'Batu', 'Bekoji', 'Berecha', 'Bishoftu Michael', 'Bishoftu', 'Chillalo', 'Denbela', 'Digelou', 'Dodolla', 'Dukem', 'Dukem Eastern Industry', 'Eteya', 'Geda (Adama Moenco sub branch)', 'Ginb Gebeya(Adama )', 'Goba', 'Hasasa', 'Huruta', 'M/A/Adama', 'Meki', 'Modjo', 'Modjo Derk Wedb', 'Nib Halal Adama', 'Olen chiti', 'Sagure', 'Tiyo Assela', 'Ziquala Bishoftu'],
    Dessie: ['Ayiteyef', 'Bati', 'Dessie', 'Haik', 'Kemise', 'Kobo', 'Kombolcha', 'Lakomelza', 'Lalibella', 'Logia', 'Mersa', 'Semera', 'Shewa Robit', 'Woldia'],
    Mekelle: ['Adi Haqi', 'Adigrat', 'Axum', 'Kesate Birehan', 'Mekelle', 'Mesobo', 'Shire', 'Wekro'],
    Wolikite: ['Agena', 'Areket', 'Bozheber', 'Buie', 'Butajira', 'Darge', 'Emdebir', 'Endegegn', 'Ensino', 'Gunchire', 'Hawaryat', 'Kare', 'Kella', 'Kosie', 'L/T/J/W/Silase Bereka (Gubre )', 'Mareko Koshe', 'Nib Halal Bidara Gebeya', 'Nib Halal Gubre Bilal', 'Nib Halal Rebi', 'Quante', 'Tiya Bitwoded Bahiru', 'Tulu Bollo', 'Walga', 'Woliso', 'Wolkite', 'Wolkite University Sub-Br.', 'Yejoka', 'Zebidar'],
  };

  for (const [districtName, branches] of Object.entries(districtBranches)) {
    const district = await prisma.district.upsert({
      where: { name: districtName },
      update: {},
      create: { name: districtName },
    });

    for (const branchName of branches) {
      await prisma.branch.upsert({
        where: { name: branchName },
        update: { districtId: district.id },
        create: {
          name: branchName,
          districtId: district.id,
        },
      });
    }
  }

  console.log('✔ Branch and District registry seeded.');

  // 5. Provision Master Admin Account
  // RULE: Utilize environment variables for passwords. Set rotation flag to true.
  // SECURITY FIX: Never fall back to a hardcoded password. The seed MUST receive
  // the initial admin password via the ADMIN_PASSWORD environment variable.
  const adminEmail = 'admin.user@nibbank.com.et';
  const rawAdminPassword = process.env.ADMIN_PASSWORD;
  if (!rawAdminPassword) {
    throw new Error(
      'FATAL: ADMIN_PASSWORD environment variable is not set. ' +
      'Set it before running the seed to avoid hardcoded credentials. ' +
      'Example: ADMIN_PASSWORD="YourStr0ng!Pass" npx prisma db seed'
    );
  }
  const defaultPassword = await bcrypt.hash(rawAdminPassword, 10);
  
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    const systemAdmin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: defaultPassword,
        firstName: 'System',
        lastName: 'Administrator',
        status: UserStatus.ACTIVE,
        needsPasswordChange: true // Enforce change on first login
      }
    });

    const adminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
    if (adminRole) {
      await prisma.userRole.create({
        data: { userId: systemAdmin.id, roleId: adminRole.id }
      });
    }
    console.log(`✔ Master Admin Created: ${adminEmail} (Rotation Enforced)`);
  }

  // 5. Provision Sample Branch Account
  const branchEmail = 'branch.one@nibbank.com.et';
  const existingBranch = await prisma.user.findUnique({ where: { email: branchEmail } });

  if (!existingBranch) {
    const branchUser = await prisma.user.create({
      data: {
        email: branchEmail,
        password: defaultPassword,
        firstName: 'Branch',
        lastName: 'One',
        status: UserStatus.ACTIVE,
        needsPasswordChange: true // Enforce change on first login
      }
    });

    const officerRole = await prisma.role.findUnique({ where: { name: 'BRANCH_OFFICER' } });
    if (officerRole) {
      await prisma.userRole.create({
        data: { userId: branchUser.id, roleId: officerRole.id }
      });
    }
    console.log(`✔ Sample Branch User Created: ${branchEmail} (Rotation Enforced)`);
  }

  console.log('✅ Institutional Registry Sync Complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
