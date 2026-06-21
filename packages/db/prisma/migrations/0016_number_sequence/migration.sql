-- CreateTable: lückenloser Belegnummernkreis je Belegart/Jahr (GoBD, Kap. 10/19)
CREATE TABLE "NumberSequence" (
    "key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("key","year")
);
