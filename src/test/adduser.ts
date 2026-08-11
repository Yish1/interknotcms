import { randomInt } from 'node:crypto';
import { hash } from 'argon2';
import { prisma } from '../scripts/connectdb.js';

async function main() {
  const password = '123456789';
  const passwordHash = await hash(password);

  const user = await prisma.user.upsert({
    where: {
      username: 'test1',
    },
    update: {
      email: 'test1@example.com',
      passwordHash,
      role: 'user',
      deletedAt: null,
      isActive: true,
    },
    create: {
      username: 'test1',
      email: 'test1@example.com',
      passwordHash,
      role: 'user',
    },
    omit: {
      passwordHash: true,
    },
  });

  console.log('Admin user is ready:', user);
  console.log(`Plaintext password: ${password}`);
}

main()
  .catch((error: unknown) => {
    console.error('Failed to create admin user:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
