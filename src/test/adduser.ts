import { randomInt } from 'node:crypto';
import { hash } from 'argon2';
import { prisma } from '../scripts/connectdb.js';

async function main() {
  const password = randomInt(0, 100_000_000).toString().padStart(8, '0');
  const passwordHash = await hash(password);

  const user = await prisma.user.upsert({
    where: {
      username: 'admin',
    },
    update: {
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
      deletedAt: null,
      isActive: true,
    },
    create: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
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
