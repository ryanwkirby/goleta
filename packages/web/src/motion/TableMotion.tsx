/**
 * The table's sense of movement.
 *
 * Every state message arrives as a finished picture: the card is already on the
 * pile, already in the hand. That is correct, and it is also why the table used
 * to jump. This layer replays the difference — it flies a card from where the
 * thing was to where the state now says it is, and holds the destination back
 * until the card gets there.
 *
 * It knows nothing the client wasn't already told. A draw nobody may see
 * arrives as `card: null` and flies face down for exactly that reason.
 *
 * Two layout effects run here, in this order, and the order is load-bearing:
 *
 *   1. `drive` reads the DOM as it stands *now* and the geometry snapshot taken
 *      at the end of the previous commit — so a card that just left the hand
 *      still has a place to fly out of.
 *   2. `snapshot` then overwrites that geometry for the next update.
 *
 * A child's layout effects run before its parent's, so both of these land after
 * the seats, the piles and the hand have registered where they are.
 */

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefCallback,
} from "react";
import { createPortal } from "react-dom";

import type { Card, GameView } from "@goleta/engine";

import { CardBack, CARD_WIDTH_PX, PlayingCard } from "../components/Card.tsx";
import type { LoggedEvent } from "../net/useGoleta.ts";
import { resolveAnchor, type AnchorGeometry, type AnchorKey } from "./anchors.ts";
import { FULL_TABLE, planFlights, type FlightPlan, type TableScale } from "./plan.ts";
import { usePrefersReducedMotion } from "./reducedMotion.ts";

/** Anything older than this already happened somewhere else. */
const STALE_MS = 1500;
/** How long past a flight's end to wait before declaring it landed anyway. */
const SETTLE_GRACE_MS = 120;

/** A plan with its two ends resolved to actual places on the screen. */
interface LiveFlight extends Omit<FlightPlan, "from" | "to"> {
  from: DOMRect;
  to: DOMRect;
}

/** What the pile draws while cards are still on their way to it. */
type PileFace = { kind: "actual" } | { kind: "card"; card: Card } | { kind: "empty" };

interface MotionApi {
  /** Registers an element as somewhere a card can fly to or from. */
  anchor: (key: AnchorKey) => RefCallback<HTMLElement>;
  /** True while this card is still in the air on its way to a hand. */
  isArriving: (cardId: string) => boolean;
  /**
   * What the pile should show. The state's own top card once everything has
   * landed; the previous one, or nothing at all, while a card is inbound.
   */
  pileFace: (actual: Card) => Card | null;
  /**
   * True while the cards are still going out.
   *
   * The one piece of "this layer is busy" anything else may read, and it is
   * about the deal rather than motion in general on purpose. Exactly one prompt
   * has to wait on it: under Dealer's Choice the game opens in `phase: "suit"`,
   * so the dealer was asked to name a suit for an 8 that had not landed on a
   * pile that was not there yet (#75). Every other prompt describes a state
   * somebody can act on, and a card in the air is no reason to hold one back.
   *
   * False under reduced motion — nothing is planned, so there is nothing to wait
   * for and no artificial wait to invent.
   */
  dealing: boolean;
  /** Motion is off. Anything that moves should skip straight to the result. */
  reduced: boolean;
}

const noopRef: RefCallback<HTMLElement> = () => () => {};

const MotionContext = createContext<MotionApi>({
  anchor: () => noopRef,
  isArriving: () => false,
  pileFace: (actual) => actual,
  dealing: false,
  reduced: true,
});

export const useMotion = (): MotionApi => useContext(MotionContext);

export function TableMotion({
  game,
  log,
  /**
   * How big the cards are wherever they come to rest on this screen. The two
   * layouts draw them at different sizes, and a flight is scaled between its
   * two ends — so a plan made against the wrong one lands and then pops.
   */
  scale = FULL_TABLE,
  children,
}: {
  game: GameView;
  log: LoggedEvent[];
  scale?: TableScale;
  children: ReactNode;
}) {
  const reduced = usePrefersReducedMotion();

  const [flights, setFlights] = useState<LiveFlight[]>([]);
  const [arriving, setArriving] = useState<ReadonlySet<string>>(() => new Set());
  const [pile, setPile] = useState<PileFace>({ kind: "actual" });
  const [dealing, setDealing] = useState(false);

  const elements = useRef(new Map<AnchorKey, HTMLElement>());
  const anchorRefs = useRef(new Map<AnchorKey, RefCallback<HTMLElement>>());
  const previousRects = useRef(new Map<AnchorKey, DOMRect>());
  /** The face the pile wore before the update being animated. */
  const previousTop = useRef<Card | null>(null);
  /** Log entries already animated. Ids only ever climb. */
  const seen = useRef(0);
  const inbound = useRef(0);
  const sequence = useRef(0);
  /**
   * The deal's own flights, so the table knows when the cards are down.
   *
   * Counted off as each one lands rather than timed: the flights already
   * announce their own arrival, backstop included, and a second clock set to the
   * same numbers would be a guess at what this one already knows. The last card
   * to land is the upcard, which is what the prompt is waiting for anyway.
   */
  const dealt = useRef(new Set<string>());

  const anchor = useCallback((key: AnchorKey): RefCallback<HTMLElement> => {
    const cached = anchorRefs.current.get(key);
    if (cached) return cached;
    const register: RefCallback<HTMLElement> = (element) => {
      if (element) elements.current.set(key, element);
      return () => {
        if (element && elements.current.get(key) === element) elements.current.delete(key);
      };
    };
    anchorRefs.current.set(key, register);
    return register;
  }, []);

  const geometry: AnchorGeometry = useMemo(
    () => ({
      live: (key) => elements.current.get(key)?.getBoundingClientRect() ?? null,
      before: (key) => previousRects.current.get(key) ?? null,
    }),
    [],
  );

  /** A flight has come to rest: reveal what it was carrying. */
  const land = useCallback((flight: LiveFlight) => {
    setFlights((current) => current.filter((other) => other.id !== flight.id));

    if (dealt.current.delete(flight.id) && dealt.current.size === 0) setDealing(false);

    const uncovered = flight.hides;
    if (uncovered !== null) {
      setArriving((current) => {
        const next = new Set(current);
        next.delete(uncovered);
        return next;
      });
    }

    if (flight.toPile) {
      inbound.current -= 1;
      // The last card in is the one the state already calls the top card, so
      // once nothing is left inbound the pile goes back to reading the state.
      const landed = flight.card;
      setPile(inbound.current > 0 && landed ? { kind: "card", card: landed } : { kind: "actual" });
    }
  }, []);

  // 1. Animate whatever is new in the log.
  useLayoutEffect(() => {
    const fresh = log.filter((entry) => entry.id > seen.current);
    if (fresh.length === 0) return;
    seen.current = fresh[0]?.id ?? seen.current;
    if (reduced) return;

    // The table acts out what just happened, never what it is only now being
    // shown. The log outlives this screen — a finished game still has one when
    // the next deal remounts the table — and none of that gets replayed.
    const now = Date.now();
    const recent = fresh.filter((entry) => now - entry.at < STALE_MS);
    if (recent.length === 0) return;

    const { flights: plans, emptiesPile, deals } = planFlights(
      recent.toReversed().map((entry) => entry.event),
      game,
      () => `f${(sequence.current += 1)}`,
      scale,
    );

    const live: LiveFlight[] = [];
    for (const plan of plans) {
      const from = resolveAnchor(plan.from, geometry);
      const to = resolveAnchor(plan.to, geometry);
      // Nowhere to fly from or to — the seat is off screen, or the hand isn't
      // rendered. The state has already updated; let it stand.
      if (from && to) live.push({ ...plan, from, to });
    }
    if (live.length === 0) return;

    const hides = live.flatMap((flight) => (flight.hides === null ? [] : [flight.hides]));
    if (hides.length > 0) {
      setArriving((current) => new Set([...current, ...hides]));
    }

    const toPile = live.filter((flight) => flight.toPile);
    if (toPile.length > 0) {
      inbound.current += toPile.length;
      const held = previousTop.current;
      setPile(emptiesPile || !held ? { kind: "empty" } : { kind: "card", card: held });
    }

    // Set here rather than the moment the batch is planned, so a deal whose
    // anchors all resolved to nothing — no seats on screen, a hand not yet
    // rendered — never says it is dealing. There would be nothing to watch and
    // nothing to end it.
    if (deals) {
      for (const flight of live) dealt.current.add(flight.id);
      setDealing(true);
    }

    setFlights((current) => [...current, ...live]);
  }, [log, game, reduced, geometry, land, scale]);

  // 2. Remember where everything is, for the next update to fly out of.
  useLayoutEffect(() => {
    const next = new Map<AnchorKey, DOMRect>();
    for (const [key, element] of elements.current) {
      if (element.isConnected) next.set(key, element.getBoundingClientRect());
    }
    previousRects.current = next;
    previousTop.current = game.topCard;
  });

  const api = useMemo<MotionApi>(
    () => ({
      anchor,
      isArriving: (cardId) => arriving.has(cardId),
      pileFace: (actual) => {
        if (pile.kind === "empty") return null;
        return pile.kind === "card" ? pile.card : actual;
      },
      dealing,
      reduced,
    }),
    [anchor, arriving, pile, dealing, reduced],
  );

  return (
    <MotionContext value={api}>
      {children}
      <FlightLayer flights={flights} onLanded={land} />
    </MotionContext>
  );
}

function FlightLayer({
  flights,
  onLanded,
}: {
  flights: LiveFlight[];
  onLanded: (flight: LiveFlight) => void;
}) {
  if (flights.length === 0) return null;
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {flights.map((flight) => (
        <FlightCard key={flight.id} flight={flight} onLanded={onLanded} />
      ))}
    </div>,
    document.body,
  );
}

/** A hand of cards all tilting the same way looks mechanical. */
const tiltFor = (seed: string): number => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  return ((hash % 13) - 6) * 0.9;
};

const centre = (rect: DOMRect): [number, number] => [
  rect.left + rect.width / 2,
  rect.top + rect.height / 2,
];

/**
 * A card in the air.
 *
 * It owns the whole of its own trip, arrival included. Anything that cancels
 * the animation — an unmount, a re-render, StrictMode running the effect twice
 * — cancels the arrival with it, and starting over schedules a fresh one. A
 * timer held anywhere else can outlive the card, or be cleared while the card
 * is still flying, and a card that never announces it has landed leaves an
 * invisible hole in somebody's hand.
 */
function FlightCard({
  flight,
  onLanded,
}: {
  flight: LiveFlight;
  onLanded: (flight: LiveFlight) => void;
}) {
  const element = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;

    // Measured rather than assumed: the card is drawn at the size it will come
    // to rest at, whatever the browser's root font size makes that.
    const { width, height } = node.getBoundingClientRect();
    const [fromX, fromY] = centre(flight.from);
    const [toX, toY] = centre(flight.to);
    // Scale from the two card sizes, not from the anchors — an anchor may be a
    // whole seat or the whole hand row, and its width says nothing about cards.
    const scale = CARD_WIDTH_PX[flight.fromSize] / CARD_WIDTH_PX[flight.size];
    const place = (x: number, y: number): string => `translate(${x - width / 2}px, ${y - height / 2}px)`;

    const animation = node.animate(
      [
        {
          transform: `${place(fromX, fromY)} scale(${scale}) rotate(${tiltFor(flight.card?.id ?? flight.id)}deg)`,
          opacity: 1,
        },
        {
          transform: `${place(toX, toY)} scale(1) rotate(0deg)`,
          opacity: 1,
        },
      ],
      {
        duration: flight.duration,
        delay: flight.delay,
        // `both` parks the card at the start of its path through the delay,
        // which is what makes a staggered deal look dealt rather than blinked.
        fill: "both",
        easing: "cubic-bezier(0.22, 0.72, 0.3, 1)",
      },
    );

    let landed = false;
    const arrive = (): void => {
      if (landed) return;
      landed = true;
      onLanded(flight);
    };
    animation.addEventListener("finish", arrive);
    // A backstop for a tab that stops painting mid-flight: the card must reveal
    // itself even if the animation never gets round to finishing.
    const backstop = window.setTimeout(arrive, flight.delay + flight.duration + SETTLE_GRACE_MS);

    return () => {
      landed = true;
      window.clearTimeout(backstop);
      animation.cancel();
    };
  }, [flight, onLanded]);

  return (
    <div ref={element} className="absolute left-0 top-0 will-change-transform">
      {flight.card ? (
        <PlayingCard card={flight.card} size={flight.size} />
      ) : (
        <CardBack size={flight.size} />
      )}
    </div>
  );
}
