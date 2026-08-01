# Rules of goleta

goleta is **Crazy Eights, reversed**. In Crazy Eights you race to empty your
hand. Here, emptying your hand knocks you out. Cards are what keep you alive,
playing them is compulsory, and drawing is the reward you have to earn.

This document is canonical. The engine implements it; the UI explains it.

---

## Setup

- **One standard 52-card deck**, shuffled. No jokers.
- **4 to 8 players.**
- Someone deals. The deal **passes one seat around the table** between rounds,
  so the same player doesn't open every game.
- Each player is dealt **3 cards**, face up.
- One card is turned face up to start the **face-up pile**. If it's an 8 it
  stays — see [natural eights](#natural-eights).
- The rest becomes the **deck**, face down.
- **The player to the dealer's left goes first**, and play moves round the
  table in that direction. Dealing is all the dealer does: there is no other
  advantage or penalty to it.

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
there and the largest hand wins. It has never come up across thousands of
simulated games and you are unlikely to ever see it; it exists so the game
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

A small sun sits beside whoever is on the clock. Any time somebody has drawn,
it can be tapped to call — that much says nothing about whether you'd be right.
But if the draw really was illegal, and it is still that player's turn, the sun
begins to glow, faintly at first and unmistakably by about ten seconds in. Call
it early and you are backing your own eyes. Wait for the sun to make up your
mind and everyone watched you wait.

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

## Hands are face up

**Every hand is visible to everyone, all the time.** Around a real table the
cards are held up, not fanned in secret, and the app plays it the same way.

That is what makes the Sunny Rule a rule and not a guess: whether someone had a
play they skipped is there on the table to be seen. The app never marks up
another player's cards for you — and it won't mark up your own either, once
you've played a game. Spotting the play, and calling it before the sun does the
work for you, is the game.

## Asking for a hand

Your first game is played with training wheels: the cards you can't play are
dimmed, and the app tells you whether you have a move. When that game ends, both
go away for good.

After that, sit on a turn for five seconds and a quiet offer of help appears
next to your hand. Take it and the highlights come back — for that turn only,
and with a **"help!"** going up over your cards on every screen at the table.
The rule is always there when you need it. It is never there quietly.
