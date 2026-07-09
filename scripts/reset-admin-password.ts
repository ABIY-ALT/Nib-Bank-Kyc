import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin.user@nibbank.com.et';
  const newPassword = process.env.ADMIN_RESET_PASSWORD || 'NibBank@2024';
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const user = await prisma.user.update({
    where: { email: adminEmail },
    data: {
      password: hashedPassword,
      needsPasswordChange: true,
    },
  });

  console.log('✅ Password reset for', adminEmail, 'to:', newPassword);
  console.log('⚠️  User will be required to change password on first login');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
