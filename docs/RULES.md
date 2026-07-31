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
- One card is turned face up to start the **face-up pile**. If it's an 8 it
  stays — see [natural eights](#natural-eights).
- The rest becomes the **deck**, face down.

There are only ever these two piles. Cards leave a hand for the face-up pile and
come back to the deck when the face-up pile is recycled. Nothing is ever set
aside or taken out of the game.

## The goal

**Be the last player still holding cards.** When your hand hits zero you are out
of the game. Play continues without you until one player remains — that player
wins.

## Your turn

On your turn you may take exactly one of two actions: **play a card** or **draw
a card**. There is no passing.

A card is playable if it matches the card in play by **rank or suit** — or if
it's an 8, which is playable on anything.

### If you can play, you must

This is the rule the whole game hangs on. If any card in your hand is playable,
you have to play one of them. You choose which. You may not decline, and you may
not draw instead.

Since playing costs you a card and drawing gains you one, every turn where you
*can* play is a turn where you lose ground. Making your hand unplayable is the
whole art of the game.

### If you cannot play, you draw

Draw one card from the deck, into your hand.

- If that card gives you a play, **you must play it** — the must-play rule
  doesn't pause just because you were mid-draw. Your turn then ends.
- If you still can't play, draw again.
- **You may draw at most 3 cards in a turn.** If you're still stuck after the
  third, your turn ends and you keep all three.

So three draws only happen when you're genuinely, thoroughly stuck — and that's
the best turn you can have.

### Eights are wild

An 8 **played from your hand** can be played on any card. After playing one, you
**name the suit** the next player has to match.

Note what this costs you: because an 8 is always playable, and because playing
is compulsory, **you can never legally draw while you hold an 8.** An 8 in your
hand is a countdown, not a weapon. Naming the suit on the way out is the
consolation prize.

### Natural eights

An 8 that is **turned up off the deck** rather than played from a hand is a
*natural 8*. It is treated like any other card: the suit shown is the suit in
play, and nobody names anything. Nothing is buried and nothing is redealt.

This covers all three places a card gets turned up off the deck: the card that
starts the game, the card turned up after a recycle, and the card flipped by a
Sunny Rule call.

The distinction is simply whether a hand was involved. Played from a hand, an 8
is wild. Flipped off the deck, it is an 8 of the suit printed on it.

### When the deck runs out

Take the **whole face-up pile**, current top card included, shuffle it, and turn
it face down as the new deck. Turn its top card face up to start the face-up
pile again, and play continues. Note that unlike most card games the card in
play changes here — nothing is held back.

If you were part-way through drawing when this happened, you carry on drawing up
to your three, so long as you still can't play. But the newly turned card is a
new card in play, and if it gives you a play then the must-play rule takes over:
you play instead of drawing again.

### Deadlock

If it ever happens that no player can play and there is nothing left to draw —
every card sitting in a hand, nobody matching the card in play — the game ends
there and the largest hand wins. With 104 cards in circulation this is close
enough to impossible that you will probably never see it; it exists so the game
cannot simply stop.

## The Sunny Rule

Anyone can draw a card. Not everyone is *allowed* to.

If you take a card from the deck when you had a playable card in your hand, any
other player still in the game can call **"Sunny Rule!"** on you.

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

**Reaching for the deck is the offence, not what comes back with it.** If the
deck was empty and your reach only triggered a recycle, you still reached, and
it is still callable. Otherwise an empty deck would be a free way to touch it
while holding a play — and to re-roll the card in play while you were at it.

If nobody calls it, nothing happens. The turn stands as played.

### If the call is right

The offender, in this order:

1. **Makes the play they skipped**, choosing among the cards that were legal
   before they reached for the deck.
2. **Plays a punishment card** — any one card from the rest of their hand, their
   choice. It does not have to be legal. It goes face up on the pile like any
   other play.
3. **Turns up the card they touched.** Every card they drew illegally goes face
   up on the pile, and the last of them becomes the new card in play. It is
   turned up off the deck, so [natural eights](#natural-eights) applies. If they
   were caught reaching for an empty deck there is nothing to turn up, and the
   punishment card is left in play instead.

Then their turn is over.

So a caught player made the play they were dodging anyway, paid a second card
on top of it, lost whatever they had illegally drawn, and changed the card in
play underneath everyone. An honest turn would have cost them one card.

If the skipped play empties their hand they are eliminated on the spot and there
is no punishment card to give. An 8 played at step 1 or 2 does **not** get to
name a suit — the card turned up at step 3 lands on top of it immediately, so
anything named would be erased before it could matter.

### If the call is wrong

The caller **gives up one card** of their choosing. It goes to the **bottom of
the face-up pile**, underneath everything already played, so it never becomes
the card in play and changes nothing about the position. Accusations aren't
free.

---

## Face-up and hidden hands

New tables play **face up**: every hand is visible to everyone, all the time.
It's how you learn what the game rewards, and it makes the Sunny Rule
self-evident — you can see exactly who could have played.

When the host decides the table is ready, they flip hands down. From then on you
can see **how many** cards each player holds, but not which ones. Sunny calls
become reads rather than observations, and a wrong one costs you a card.

The Sunny Rule is live in both modes, from the very first game.
