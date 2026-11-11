-- CreateTable
CREATE TABLE "insight_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "insights" JSONB NOT NULL,
    "data_points_used" INTEGER NOT NULL,

    CONSTRAINT "insight_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insight_snapshots_user_id_key" ON "insight_snapshots"("user_id");

-- AddForeignKey
ALTER TABLE "insight_snapshots" ADD CONSTRAINT "insight_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
