import { prisma } from '../scripts/connectdb';

async function main() {
  const user = await prisma.user.create({
    data: {
      username: 'testuser',
      email: 'test@example.com',
      passwordHash: 'test_hash',
    },
  });

  console.log('Created test user:', user);
}

main()
  .catch((error: unknown) => {
    console.error('Failed to create test user:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
