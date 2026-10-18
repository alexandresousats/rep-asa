"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import type { DueSlice, InsightBar } from "@/lib/workspace-insights";

const OTHERS = "#eab308";
const Y_LABEL = "Tarefa (contagem, em números)";

export function InsightChartCard({
  title,
  caption,
  items,
  preview = 10,
  avatars = false,
}: {
  title: string;
  caption: string;
  items: InsightBar[];
  preview?: number;
  avatars?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shown = previewBars(items, preview);
  return (
    <Card className="border-none">
      <h2 className="mb-3 text-sm font-medium text-ink">{title}</h2>
      <ColumnChart items={shown} avatars={avatars} label={title} />
      <ChartFooter caption={caption} onExpand={() => setOpen(true)} />
      <Dialog open={open} title={title} onClose={() => setOpen(false)} className="max-w-lg">
        <Breakdown items={items} />
      </Dialog>
    </Card>
  );
}

export function DueStatusCard({
  title,
  caption,
  slices,
}: {
  title: string;
  caption: string;
  slices: DueSlice[];
}) {
  const [open, setOpen] = useState(false);
  const items: InsightBar[] = slices.map((slice) => ({
    id: slice.id,
    label: slice.label,
    value: slice.value,
    color: slice.color,
  }));
  return (
    <Card className="border-none">
      <h2 className="mb-3 text-sm font-medium text-ink">{title}</h2>
      <DonutChart slices={slices} />
      <ChartFooter caption={caption} onExpand={() => setOpen(true)} />
      <Dialog open={open} title={title} onClose={() => setOpen(false)} className="max-w-lg">
        <Breakdown items={items} />
      </Dialog>
    </Card>
  );
}

function ChartFooter({ caption, onExpand }: { caption: string; onExpand: () => void }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-line-subtle pt-3">
      <p className="min-w-0 truncate text-[11px] text-faint">{caption}</p>
      <button
        type="button"
        onClick={onExpand}
        className="shrink-0 rounded-md border border-line px-2.5 py-1 text-[11px] text-ink hover:bg-hover"
      >
        Ver tudo
      </button>
    </div>
  );
}

function Breakdown({ items }: { items: InsightBar[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (items.length === 0) {
    return <p className="text-sm text-faint">Nenhuma tarefa neste período.</p>;
  }
  return (
    <div className="max-h-[60vh] space-y-0.5 overflow-y-auto">
      {items.map((item) => {
        const pct = total === 0 ? 0 : Math.round((item.value / total) * 100);
        const row = (
          <>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.label}</span>
            <span className="w-10 shrink-0 text-right text-xs text-faint">{pct}%</span>
            <span className="w-12 shrink-0 text-right text-sm text-ink">
              {item.value.toLocaleString("pt-BR")}
            </span>
          </>
        );
        if (!item.href) {
          return (
            <div key={item.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
              {row}
            </div>
          );
        }
        return (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-hover"
          >
            {row}
          </Link>
        );
      })}
    </div>
  );
}

function ColumnChart({
  items,
  avatars,
  label,
}: {
  items: InsightBar[];
  avatars: boolean;
  label: string;
}) {
  const uid = useId().replace(/:/g, "");
  const router = useRouter();
  if (items.length === 0) {
    return <p className="py-12 text-sm text-faint">Nenhuma tarefa neste período.</p>;
  }

  const max = axisMax(Math.max(...items.map((item) => item.value)));
  const ticks = axisTicks(max);
  const padL = 52;
  const padR = avatars ? 16 : 64;
  const padT = 22;
  const plotH = 200;
  const padB = avatars ? 44 : 108;
  const colW = 52;
  const barW = 30;
  const width = padL + items.length * colW + padR;
  const height = padT + plotH + padB;
  const baseline = padT + plotH;

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label}
        className="max-w-none font-sans"
      >
        <text
          x={12}
          y={padT + plotH / 2}
          transform={`rotate(-90 12 ${padT + plotH / 2})`}
          textAnchor="middle"
          fill="var(--text-tertiary)"
          fontSize="11"
        >
          {Y_LABEL}
        </text>
        {ticks.map((tick) => {
          const y = baseline - (tick / max) * plotH;
          return (
            <g key={tick}>
              <line
                x1={padL}
                x2={width - 8}
                y1={y}
                y2={y}
                stroke="var(--border-subtle)"
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--text-tertiary)"
                fontSize="11"
              >
                {tick.toLocaleString("pt-BR")}
              </text>
            </g>
          );
        })}
        {items.map((item, index) => {
          const cx = padL + index * colW + colW / 2;
          const h = (item.value / max) * plotH;
          const y = baseline - h;
          const x = cx - barW / 2;
          return (
            <g
              key={item.id}
              className={item.href ? "cursor-pointer" : undefined}
              onClick={() => {
                if (item.href) router.push(item.href);
              }}
            >
              <title>{`${item.label}: ${item.value.toLocaleString("pt-BR")}`}</title>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 2)}
                rx={2}
                fill={item.color}
              />
              <text
                x={cx}
                y={y - 6}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontSize="12"
                fontWeight="600"
              >
                {item.value.toLocaleString("pt-BR")}
              </text>
              {avatars && item.initials ? (
                <AvatarMark uid={uid} item={item} cx={cx} cy={baseline + 20} />
              ) : (
                <text
                  x={cx}
                  y={baseline + 14}
                  transform={`rotate(55 ${cx} ${baseline + 14})`}
                  textAnchor="start"
                  fill="var(--text-tertiary)"
                  fontSize="11"
                >
                  {shortLabel(item.label)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function AvatarMark({
  uid,
  item,
  cx,
  cy,
}: {
  uid: string;
  item: InsightBar;
  cx: number;
  cy: number;
}) {
  const clip = `${uid}-${item.id}`;
  return (
    <g>
      <clipPath id={clip}>
        <circle cx={cx} cy={cy} r={10} />
      </clipPath>
      {item.avatar ? (
        <image
          href={item.avatar}
          x={cx - 10}
          y={cy - 10}
          width={20}
          height={20}
          clipPath={`url(#${clip})`}
        />
      ) : (
        <>
          <circle cx={cx} cy={cy} r={10} fill="var(--bg-hover)" stroke="var(--border-default)" />
          <text
            x={cx}
            y={cy + 3}
            textAnchor="middle"
            fill="var(--text-primary)"
            fontSize="8"
            fontWeight="600"
          >
            {item.initials}
          </text>
        </>
      )}
    </g>
  );
}

function DonutChart({ slices }: { slices: DueSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 68;
  const stroke = 28;
  const circ = 2 * Math.PI * radius;
  const visible = slices.filter((slice) => slice.value > 0);
  const gap = visible.length > 1 ? 5 : 0;
  let cursor = 0;

  return (
    <div className="flex flex-wrap items-center gap-8 py-2">
      <svg
        viewBox="0 0 200 200"
        className="h-52 w-52 shrink-0"
        role="img"
        aria-label={slices.map((slice) => `${slice.label} ${slice.value}`).join(", ")}
      >
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={stroke}
        />
        {visible.map((slice) => {
          const raw = (slice.value / total) * circ;
          const length = Math.max(raw - gap, 1);
          const dash = `${length} ${circ - length}`;
          const offset = cursor;
          cursor += raw;
          return (
            <circle
              key={slice.id}
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 100 100)"
            />
          );
        })}
        <text
          x="100"
          y="100"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text-primary)"
          fontSize={compactCount(total).length > 4 ? 22 : 32}
          fontWeight="500"
        >
          {compactCount(total)}
        </text>
      </svg>
      <div className="space-y-2.5">
        {slices.map((slice) => (
          <div key={slice.id} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: slice.color }}
            />
            <span className="text-faint">{slice.label}</span>
            <span className="text-ink">{slice.value.toLocaleString("pt-BR")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function previewBars(items: InsightBar[], limit: number) {
  if (items.length <= limit) return items;
  const head = items.slice(0, limit - 1);
  const rest = items.slice(limit - 1);
  return [
    ...head,
    {
      id: "__others",
      label: "E outros mais",
      value: rest.reduce((sum, item) => sum + item.value, 0),
      color: OTHERS,
    },
  ];
}

function shortLabel(label: string) {
  if (label.length <= 16) return label;
  return `${label.slice(0, 15)}…`;
}

function axisMax(value: number) {
  if (value <= 0) return 4;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  for (const step of steps) {
    const ticks = Math.ceil(value / step);
    if (ticks >= 2 && ticks <= 5) return ticks * step;
  }
  const step = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / step) * step;
}

function axisTicks(max: number) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  let step = max;
  for (const candidate of steps) {
    if (max % candidate === 0 && max / candidate <= 5 && max / candidate >= 2) {
      step = candidate;
      break;
    }
  }
  const ticks: number[] = [];
  for (let value = 0; value <= max + 0.001; value += step) ticks.push(value);
  return ticks;
}

function compactCount(value: number) {
  if (value < 1000) return value.toLocaleString("pt-BR");
  const thousands = value / 1000;
  const digits = thousands >= 10 || Number.isInteger(thousands) ? 0 : 1;
  const text = thousands.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${text} mil`;
}
