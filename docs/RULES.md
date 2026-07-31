# Rules of goleta

goleta is **Crazy Eights, reversed**. In Crazy Eights you race to empty your
hand. Here, emptying your hand knocks you out. Cards are what keep you alive,
playing them is compulsory, and drawing is the reward you have to earn.

This document is canonical. The engine implements it; the UI explains it.

---

## Setup

- **Two standard 52-card decks**, shuffled together. 104 cards, no jokers.
  Duplicate cards are distinct — there are two of every card, and the engine
  tracks each one separately.
- **3 to 6 players.**
- Each player is dealt a starting hand — **5 cards by default**, adjustable by
  the host in the lobby.
- One card is turned face up to start the **discard pile**. If it's an 8, it is
  buried and another card is turned up, until the starting card isn't an 8.
- The rest becomes the **draw pile**.

## The goal

**Be the last player still holding cards.** When your hand hits zero you are out
of the game. Play continues without you until one player remains — that player
wins.

## Your turn

On your turn you may take exactly one of two actions: **play a card** or **draw
a card**. There is no passing.

A card is playable if it matches the top of the discard pile by **rank or
suit** — or if it's an 8, which is playable on anything.

### If you can play, you must

This is the rule the whole game hangs on. If any card in your hand is playable,
you have to play one of them. You choose which. You may not decline, and you may
not draw instead.

Since playing costs you a card and drawing gains you one, every turn where you
*can* play is a turn where you lose ground. Making your hand unplayable is the
whole art of the game.

### If you cannot play, you draw

Draw one card from the draw pile.

- If that card gives you a play, **you must play it** — the must-play rule
  doesn't pause just because you were mid-draw. Your turn then ends.
- If you still can't play, draw again.
- **You may draw at most 3 cards in a turn.** If you're still stuck after the
  third, your turn ends and you keep all three.

So three draws only happen when you're genuinely, thoroughly stuck — and that's
the best turn you can have.

### Eights are wild

An 8 can be played on any card. After playing one, you **name the suit** the
next player has to match.

Note what this costs you: because an 8 is always playable, and because playing
is compulsory, **you can never legally draw while you hold an 8.** An 8 in your
hand is a countdown, not a weapon. Naming the suit on the way out is the
consolation prize.

### When the draw pile runs out

Take the discard pile and the disposal pile, leave the current top card where it
is, shuffle everything else together, and that's the new draw pile. Play
continues. Cards recycle for as long as the game lasts.

## The Sunny Rule

Anyone can draw a card. Not everyone is *allowed* to.

If you take a card from the draw pile when you had a playable card in your hand,
any other player still in the game can call **"Sunny Rule!"** on you.

### Calling it

The window opens the moment a card is drawn and closes when **the next player
takes their first action**. That's wide enough to catch a violation after the
turn has already moved on — the turn gets rewound — but once the next player has
committed, the moment has passed.

If several people call at once, only the **first call to arrive** is judged. The
rest are too late, and cost them nothing.

It applies to any illegal draw in the turn, not just the first one. Drawing a
second card when the first card you drew gave you a play is exactly the same
offence.

### If the call is right

The offender:

1. **Disposes of every card they drew** from the illegal draw onwards. (A card
   drawn legitimately, before they had any play, stays in their hand.)
2. **Disposes of one more card** — the punishment card — of their own choosing.
3. **Makes the play they skipped**, choosing among the cards that were legal.

If the disposals empty their hand, they're eliminated on the spot and the play
is skipped.

### If the call is wrong

The caller **disposes of one card** of their choosing. Accusations aren't free.

### Disposal

Disposed cards go to the **disposal pile**, face up. They're out of play — they
don't sit on the discard pile and they don't change what's playable. They come
back only when the draw pile runs dry and everything gets reshuffled.

---

## Face-up and hidden hands

New tables play **face up**: every hand is visible to everyone, all the time.
It's how you learn what the game rewards, and it makes the Sunny Rule
self-evident — you can see exactly who could have played.

When the host decides the table is ready, they flip hands down. From then on you
can see **how many** cards each player holds, but not which ones. Sunny calls
become reads rather than observations, and a wrong one costs you a card.

The Sunny Rule is live in both modes, from the very first game.
