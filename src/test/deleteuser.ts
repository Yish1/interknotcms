import { prisma } from '../scripts/connectdb';

async function main() {
  const result = await prisma.user.deleteMany({
    where: {
      username: 'testuser',
    },
  });

  console.log(`Deleted ${result.count} test user(s).`);
}

main()
  .catch((error: unknown) => {
    console.error('Failed to delete test user:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
