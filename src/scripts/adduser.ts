import { prisma } from './connectdb'

async function main() {
  const user = await prisma.user.create({
    data: {
      username: 'testuser',
      email: 'test@example.com',
      password: 'test_hash',
    },
  })

  console.log(user)
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })