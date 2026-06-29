"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BRAND = "#171716";
const PALETTE = ["#171716", "#52524d", "#8f8f89", "#b8946d", "#d9d9d6", "#a87c55"];

export function RevenueAreaChart({
  data,
}: {
  data: { month: string; revenue: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={BRAND} stopOpacity={0.35} />
            <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0ef" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="#8a978f" />
        <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#8a978f" width={48} />
        <Tooltip
          formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #eef0ef", fontSize: 13 }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke={BRAND}
          strokeWidth={2.5}
          fill="url(#rev)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function OccupancyBarChart({
  data,
}: {
  data: { house: string; occupied: number; available: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0ef" vertical={false} />
        <XAxis dataKey="house" tickLine={false} axisLine={false} fontSize={12} stroke="#8a978f" />
        <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#8a978f" width={32} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eef0ef", fontSize: 13 }} />
        <Bar dataKey="occupied" stackId="a" fill={BRAND} radius={[0, 0, 0, 0]} name="Occupied" />
        <Bar dataKey="available" stackId="a" fill="#d9d9d6" radius={[6, 6, 0, 0]} name="Available" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusPieChart({
  data,
}: {
  data: { status: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="status"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eef0ef", fontSize: 13 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
