import { prisma } from '../scripts/connectdb.js';

async function main() {
  const result = await prisma.user.deleteMany({
    where: {
      username: 'testuser',
    },
  });

  if (result.count === 0) {
    console.log('Test user does not exist.');
    return;
  }

  console.log('Test user deleted.');
}

main()
  .catch((error: unknown) => {
    console.error('Failed to delete test user:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
