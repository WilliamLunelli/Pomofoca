-- CreateTable
CREATE TABLE "daily_study_stats" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "total_seconds" INTEGER NOT NULL DEFAULT 0,
    "focus_seconds" INTEGER NOT NULL DEFAULT 0,
    "sessions_completed" INTEGER NOT NULL DEFAULT 0,
    "sessions_interrupted" INTEGER NOT NULL DEFAULT 0,
    "by_subject" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_study_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_study_stats_user_id_date_key" ON "daily_study_stats"("user_id", "date");

-- AddForeignKey
ALTER TABLE "daily_study_stats" ADD CONSTRAINT "daily_study_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
