import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log("Banco já tem usuários. Nenhum dado de demonstração foi inserido.");
    return;
  }

  await prisma.user.create({
    data: {
      id: "u1",
      firstName: "Alexandre",
      lastName: "Sousa",
      name: "Alexandre Sousa",
      email: "alexandre@asa.app",
      passwordHash: await bcrypt.hash("asa123", 10),
      emailVerifiedAt: new Date(),
      initials: "AS",
      role: "Direção",
      access: "admin",
      master: true,
      workspaceMembers: {
        create: {
          workspace: {
            create: {
              id: "w1",
              name: "Espaço de Alexandre",
            },
          },
          access: "admin",
          status: "active",
          role: "Direção",
          owner: true,
          acceptedAt: new Date(),
        },
      },
    },
  });
  console.log("Conta administrador criada: alexandre@asa.app");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
