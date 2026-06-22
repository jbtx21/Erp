-- ERP-Grundfunktion G-7: generisches Dashboard (Charts + KPI-Kacheln als Entitäten).

-- CreateEnum
CREATE TYPE "ChartType" AS ENUM ('BAR', 'LINE', 'DONUT');
CREATE TYPE "DashboardWidgetKind" AS ENUM ('CHART', 'CARD');
CREATE TYPE "WidgetWidth" AS ENUM ('FULL', 'HALF');

-- CreateTable
CREATE TABLE "DashboardChart" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chartType" "ChartType" NOT NULL DEFAULT 'BAR',
    "metricKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DashboardChart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NumberCard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NumberCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DashboardItem" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "kind" "DashboardWidgetKind" NOT NULL,
    "refId" TEXT NOT NULL,
    "width" "WidgetWidth" NOT NULL DEFAULT 'HALF',
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DashboardItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dashboard_name_key" ON "Dashboard"("name");
CREATE INDEX "DashboardItem_dashboardId_idx" ON "DashboardItem"("dashboardId");

-- AddForeignKey
ALTER TABLE "DashboardItem" ADD CONSTRAINT "DashboardItem_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
