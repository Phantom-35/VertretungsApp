import { classRoomLabel } from "@/lib/class-rooms";
import { ENTRANCE, FLOOR_PLANS, PLAN_HEIGHT, PLAN_WIDTH, floorName, type Floor, type Shape } from "@/lib/rooms";

const NUMBER_SIZE = 15;
const NAME_SIZE = 10;
const SMALL_NAME_SIZE = 8.5;
const PAD = 4;

/** Words wrapped to the width, or null when a word does not fit (then the name is left out). */
function wrap(text: string, width: number, size: number, maxLines: number) {
  const charWidth = size * 0.56;
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    if (word.length * charWidth > width) {
      return null;
    }
    const last = lines.at(-1);
    if (last !== undefined && (last.length + 1 + word.length) * charWidth <= width) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines.length <= maxLines ? lines : null;
}

/** A small flight of stairs, like the sign on the printed plan. */
function StairsSign({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x - 9} ${y + 7}h5v-5h5v-5h5v-5h4`}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="stroke-foreground/55"
    />
  );
}

function Label({ shape, marked }: { shape: Shape; marked: boolean }) {
  const cx = shape.x + shape.w / 2;
  const cy = shape.y + shape.h / 2;
  const width = shape.w - PAD * 2;
  if (shape.kind === "stairs") {
    return <StairsSign x={cx} y={cy} />;
  }
  if (shape.kind === "wc" || shape.kind === "lift") {
    const text = shape.kind === "wc" ? "WC" : "Aufzug";
    return wrap(text, width, 9, 1) ? (
      <text x={cx} y={cy + 3} fontSize={9} textAnchor="middle" className="fill-muted">
        {text}
      </text>
    ) : null;
  }
  if (shape.kind !== "room" && shape.kind !== "space") {
    return null;
  }

  const numberSize = Math.min(NUMBER_SIZE, width / 1.75);
  const extra = [
    ...(shape.id ? [classRoomLabel(shape.id)].filter((label): label is string => label !== null) : []),
    ...(shape.name ? [shape.name] : []),
  ];
  // Below the number, as far as there is room: the class first, then the name.
  const room = shape.h - PAD * 2 - (shape.id ? numberSize + 2 : 0);
  const lines: { text: string; accent: boolean; size: number }[] = [];
  const used = () => lines.reduce((sum, line) => sum + line.size + 1, 0);
  for (const [index, text] of extra.entries()) {
    // Smaller if a long word ("Oberstufenraum") does not fit otherwise.
    for (const size of [NAME_SIZE, SMALL_NAME_SIZE]) {
      const free = Math.floor((room - used()) / (size + 1));
      const wrapped = free > 0 ? wrap(text, width, size, Math.min(free, 3)) : null;
      if (wrapped) {
        lines.push(...wrapped.map((line) => ({ text: line, accent: index === 0 && extra.length === 2, size })));
        break;
      }
    }
  }
  const total = (shape.id ? numberSize : 0) + used();
  let y = cy - total / 2;
  return (
    <>
      {shape.id ? (
        <text
          x={cx}
          y={(y += numberSize) - 2}
          fontSize={numberSize}
          fontWeight={700}
          textAnchor="middle"
          className={marked ? "fill-white" : "fill-foreground"}
        >
          {shape.id}
        </text>
      ) : null}
      {lines.map((line, index) => (
        <text
          key={index}
          x={cx}
          y={(y += line.size + 1) - 1}
          fontSize={line.size}
          fontWeight={line.accent ? 700 : 500}
          textAnchor="middle"
          className={marked ? "fill-white" : line.accent ? "fill-accent-strong" : "fill-muted"}
        >
          {line.text}
        </text>
      ))}
    </>
  );
}

const fills: Record<Shape["kind"], string> = {
  room: "fill-surface",
  space: "fill-surface",
  wc: "fill-surface-muted",
  lift: "fill-surface-muted",
  stairs: "fill-surface-muted",
  court: "fill-accent-soft",
  blocked: "fill-foreground/15",
};

/** One floor of the main building, a room marked if given. */
export function RoomMap({ floor, marked, className }: { floor: Floor; marked: string | null; className?: string }) {
  const shapes = FLOOR_PLANS[floor];
  const markedShape = marked ? shapes.find((shape) => shape.id === marked) : undefined;
  return (
    <svg
      role="img"
      aria-label={`${floorName(floor)}${markedShape ? `, Raum ${marked} markiert` : ""}`}
      viewBox={`-6 -6 ${PLAN_WIDTH + 12} ${PLAN_HEIGHT + 12}`}
      className={className}
      fontFamily="inherit"
    >
      <rect width={PLAN_WIDTH} height={PLAN_HEIGHT} rx={4} strokeWidth={2.5} className="fill-background-soft stroke-foreground/45" />
      {shapes.map((shape, index) => {
        const isMarked = shape === markedShape;
        return (
          <g key={index} data-room={shape.id}>
            <rect
              x={shape.x}
              y={shape.y}
              width={shape.w}
              height={shape.h}
              strokeWidth={isMarked ? 2.5 : 1.2}
              className={isMarked ? "fill-accent stroke-accent-strong" : `${fills[shape.kind]} stroke-foreground/35`}
            />
            <Label shape={shape} marked={isMarked} />
          </g>
        );
      })}
      {floor === 0 ? (
        <>
          {/* The entrance: an opening in the outer wall. */}
          <rect x={ENTRANCE.x + 2} y={PLAN_HEIGHT - 3} width={ENTRANCE.w - 4} height={6} className="fill-background-soft" />
          <text
            x={ENTRANCE.x + ENTRANCE.w / 2}
            y={PLAN_HEIGHT - 14}
            fontSize={13}
            fontWeight={700}
            textAnchor="middle"
            className="fill-muted"
          >
            Eingang ↑
          </text>
        </>
      ) : null}
      {markedShape ? (
        <rect
          x={markedShape.x - 5}
          y={markedShape.y - 5}
          width={markedShape.w + 10}
          height={markedShape.h + 10}
          rx={6}
          fill="none"
          strokeWidth={3}
          className="room-pulse stroke-accent"
        />
      ) : null}
    </svg>
  );
}
