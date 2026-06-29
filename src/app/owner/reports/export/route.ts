import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import {
  getOutstandingBalances,
  getOccupancyByHouse,
  getHousePerformance,
  getApplicationsByStatus,
  toCSV,
} from "@/services/reports";
import { APPLICATION_STATUS_META } from "@/constants";

export async function GET(req: Request) {
  await requireRole("OWNER");
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "outstanding";

  let rows: Record<string, unknown>[] = [];
  let filename = "report.csv";

  switch (type) {
    case "outstanding": {
      const data = await getOutstandingBalances();
      rows = data.map((d) => ({
        Student: d.name,
        House: d.house,
        Invoiced: d.due,
        Paid: d.paid,
        Balance: d.balance,
      }));
      filename = "outstanding-balances.csv";
      break;
    }
    case "occupancy": {
      const data = await getOccupancyByHouse();
      rows = data.map((d) => ({
        House: d.house,
        Capacity: d.capacity,
        Occupied: d.occupied,
        Available: d.available,
        "Rate (%)": d.rate,
      }));
      filename = "occupancy.csv";
      break;
    }
    case "house-performance": {
      const data = await getHousePerformance();
      rows = data.map((d) => ({
        House: d.house,
        Students: d.students,
        Rooms: d.rooms,
        Capacity: d.capacity,
        Occupied: d.occupied,
        "Occupancy (%)": d.occupancyRate,
        Revenue: d.revenue,
      }));
      filename = "house-performance.csv";
      break;
    }
    case "applications": {
      const data = await getApplicationsByStatus();
      rows = data.map((d) => ({
        Status: APPLICATION_STATUS_META[d.status]?.label ?? d.status,
        Count: d.count,
      }));
      filename = "applications.csv";
      break;
    }
    default:
      return new NextResponse("Unknown report type", { status: 400 });
  }

  const csv = toCSV(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
