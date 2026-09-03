# Rules of goleta

goleta is **Crazy Eights, reversed**. In Crazy Eights you race to empty your
hand. Here, emptying your hand knocks you out. Cards are what keep you alive,
playing them is compulsory, and drawing is the reward you have to earn.

This document is canonical. The engine implements it; the UI explains it.
Where it knowingly leaves the original written rules, that is written down at
the [foot of this file](#where-this-departs-from-the-original).

**To learn the game rather than to check it**, read
[`HOW-TO-PLAY.md`](../HOW-TO-PLAY.md) instead — the original rules in plain
English, written for somebody sitting down to their first hand. The original text
itself is in [`ORIGINAL-RULES.md`](ORIGINAL-RULES.md).

---

## Setup

- **One standard 52-card deck**, shuffled. No jokers.
- **4 to 8 players.**
- Someone deals. The deal **passes one seat around the table** between rounds,
  so the same player doesn't open every game.
- Each player is dealt **3 cards**, face up.
- One card is turned face up to start the **face-up pile**. If it's an 8 it
  stays — see [natural eights](#natural-eights), unless the table is playing
  [Dealer's Choice](#dealers-choice).
- The rest becomes the **deck**, face down.
- **The player to the dealer's left goes first**, and play moves round the
  table in that direction. Dealing is all the dealer does: there is no other
  advantage or penalty to it, unless the table has turned
  [Dealer's Choice](#dealers-choice) on.

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
- **You may draw at most 3 cards in a turn.** After the third, your turn does not
  end on its own: **you end it**, by saying you're done. You keep all three.

So three draws only happen when you're genuinely, thoroughly stuck — and that's
the best turn you can have.

**Declaring the end of your turn is a move like any other, and it can be a
lie.** If the third card gave you a play, the must-play rule says you have to
play it — and saying you're done instead is a
[Sunny Rule](#the-sunny-rule) violation exactly as reaching for the deck would
have been. Nothing stops you. The table has to catch you.

The same is true when the deck has run out and there is nothing left to recycle
back into it: your turn is over, and ending it is yours to say. The card most likely to spoil one is an
[8](#eights-are-wild), which is playable on anything and so always cuts a draw
short.

### Eights are wild

An 8 **played from your hand** can be played on any card. After playing one, you
**name the suit** the next player has to match.

There are two ways an 8 reaches you and both of them are bad.

**Dealt one, you are on a countdown.** Because an 8 is always playable, and
because playing is compulsory, **you can never legally draw while you hold an
8.** The best turn in the game is shut to you until it is gone, and you do not
get to choose when that is.

**Draw one, and your turn stops dead.** Being stuck is the best turn you can
have — up to three cards into your hand — but the moment a drawn card can be
played, you have to play it and your turn is over. An 8 can always be played. So
drawing one ends the turn on the spot: the card goes straight back out, and it
takes whatever draws you had left with it. Drawn on the first of three, an 8
costs you the two you never got to take.

Either way it finishes the same, and the finish is the point: **the 8 leaves
your hand.** That is a card gone, and cards are the only thing keeping you in
this game.

What softens it is the suit, and that is worth more than a consolation, because
**every hand is face up, so naming a suit is not a guess.** You can read what
the players between you and your next turn are holding and pick something that
does a specific thing to them. With the cards lying right you can name a suit
nobody can answer and arrange to come back round to a hand you can't play
either — which is to say, arrange your own draw. Hold more than one 8 and you
can do it again each time the turn comes back to you.

None of which makes an 8 a card you *want*. You are still a card down, and down
is the wrong direction. It makes it a card you hope to spend well.
[The Power of Eights](#the-power-of-eights) is the rule that takes even that
hope away.

### Natural eights

An 8 that is **turned up off the deck** rather than played from a hand is a
*natural 8*. It is treated like any other card: the suit shown is the suit in
play, and nobody names anything. Nothing is buried and nothing is redealt.

This covers all three places a card gets turned up off the deck: the card that
starts the game, the card turned up after a recycle, and the card flipped by a
Sunny Rule call. The first of those is the one [Dealer's
Choice](#dealers-choice) overrides.

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

This is the one rule a table can [switch off](#playing-without-the-sunny-rule).
It is on unless somebody says otherwise.

If you take a card from the deck when you had a playable card in your hand, any
other player still in the game can call **"Sunny Rule!"** on you.

**There are two ways to commit it**, and they are the same offence:

- **Reaching for the deck** while holding a play.
- **Saying you're done** while holding a play, at the end of a turn you have
  drawn out. The three draws may have been perfectly honest — you were stuck
  every time you reached — and it is the card the *third* one gave you that
  makes ending the turn an offence. A call is judged against your hand as it
  stood when you said it.

Nothing on any screen tells the two apart, and nothing tells an honest end from
a dishonest one.

### Calling it

The window opens the moment a card is drawn and closes when **the next player
takes their first action**. That's wide enough to catch a violation after the
turn has already moved on — the turn gets rewound — but once the next player has
committed, the moment has passed.

If several people call at once, only the **first call to arrive** is judged. The
rest are too late, and cost them nothing.

When somebody draws, a small sun appears beside them — and stays beside them
until the window shuts, even once play has moved on. Tap it to call. That it is
there at all says nothing about whether you'd be right; it means only that they
reached, and it looks exactly the same whether they were allowed to or not.

**A turn ended after three draws keeps the window open for as long as the player
takes over it**, which is the point: the third reach is the hardest one to
judge, because by then they are holding three more cards than the table has been
reading.

### Naming the card

**A call has to name a card.** Tapping the sun doesn't accuse anyone by itself:
it shows you the offender's hand *as it stood immediately before they reached*,
and you tap the card you say they should have played.

It is that hand and no other. Anything they drew after the reach you are
challenging was never theirs to play, so it is not on the list and cannot be
named.

**What it does not show you is the board that hand is judged against**: the suit
that had to be matched at the reach, and the rank that was in play then. That is
yours to remember, and it is the part of a call you pay for out of your own
attention. The pile in front of you is often no longer that board by the time
anybody calls — the window outlives the turn, so the offender may well have
played since, and an 8 played since will have changed the suit outright. Name a
card because it matched the pile as it is now and you can be wrong twice over.

While you have somebody's hand up in front of you, the game log at the foot of
the screen is hidden from you as well. Everything that has been played into the
middle is written down in it, in order, and this is the one moment you are being
asked to remember it rather than look it up.

Nothing in the app marks up which of those cards was legal. It is the same
judgement you would make leaning over a real table — their cards are face up,
what has gone into the middle you watched go in, and the two are all you need.

It applies to any illegal draw in the turn, not just the first one. Drawing a
second card when the first card you drew gave you a play is exactly the same
offence.

**Reaching for the deck is the offence, not what comes back with it.** If the
deck was empty and your reach only triggered a recycle, you still reached, and
it is still callable. Otherwise an empty deck would be a free way to touch it
while holding a play — and to re-roll the card in play while you were at it.

If nobody calls it, nothing happens. The turn stands as played.

### If the call is right

Right means the card you named really was legal against the card in play at the
moment they reached. The offender, in this order:

1. **Makes the play they skipped**, choosing among the cards that were legal
   before they reached for the deck. They are not held to the card you named —
   naming one only had to prove they had one.
2. **Sacrifices a punishment card** — any one card from the rest of their hand,
   their choice. It does not have to be legal, because it is not a play: it is
   slid **under** the pile, face up with the rest of it. It never becomes the
   card in play, and nobody ever matches it. It comes back the way any face-up
   card does, in a [reshuffle](#when-the-deck-runs-out).

   Under the pile rather than on it, because being caught must never hand you a
   free placement of a card you picked out of your own hand: whichever card they
   sacrifice, the board the next player reads is the same one.
3. **Turns up the card they touched.** Every card they drew illegally goes face
   up on the pile, and the last of them becomes the new card in play. It is
   turned up off the deck, so [natural eights](#natural-eights) applies.

   If they were caught reaching for an **empty** deck there is nothing they
   touched to turn up, and no deck for the next player to reach for either. The
   deck is answered the way an empty deck always is: the whole pile — punishment
   card and all — is [shuffled back](#when-the-deck-runs-out) and a fresh card is
   turned up to start it again. Nobody chooses that card, which is the point.

   And if they were caught for **saying they were done** rather than for a
   reach, they touched nothing at all: nothing is turned up, and the card they
   were made to play at step 1 stands as the card in play.

Then their turn is over.

So a caught player made the play they were dodging anyway, paid a second card
on top of it, and lost whatever they had illegally drawn. An honest turn would
have cost them one card.

If the skipped play empties their hand they are eliminated on the spot and there
is no punishment card to sacrifice. An 8 sacrificed at step 2 names no suit,
because a card slid under the pile is not in play. An 8 played at step 1 names none
either: where something is turned up at step 3 it lands on top immediately, and
where nothing is, the 8 simply stands as the card in play with its own printed
suit, exactly as a [natural eight](#natural-eights) does.

### If the call is wrong

**Nothing happens to anybody's hand.** No card is lost, by the caller or by the
accused, and the position is exactly as it was.

What a miss costs is your voice: **you cannot call the Sunny Rule again until
the table has reached for the deck three more times.** Everyone else can still
call in the meantime, including on the very reach you just got wrong.

It counts reaches rather than cards, for the reason the offence itself is
written that way: a reach that found an empty deck and only triggered a recycle
is still a reach, and it runs your lockout down like any other.

That is the whole penalty, and it is deliberately not a card. Having to name a
specific card is what stops a call being a free guess — you have to be able to
point at the play they skipped — so a wrong call is already a wrong claim made
out loud in front of everyone. The lockout just stops you making another one
immediately.

---

## House rules

Everything above is the game as written, and it is what you get if nobody
touches anything. A table can vary three things, chosen by the host in the
lobby before a deal. They apply to the next game, never to one already running.

### Playing without the Sunny Rule

The Sunny Rule can be switched off entirely.

With it off, reaching for the deck while holding a play is simply not an
offence — there is no accusation to make, no sun appears beside anybody, and
nothing anywhere in the app suggests otherwise. It is a quieter, friendlier
game, and a considerably less interesting one. It is also the right setting for
a table that would rather not have to watch each other.

The must-play rule itself does **not** relax. If you can play, you still must;
there is simply nobody empowered to do anything about it if you don't.

### The Power of Eights

*This game's own, not the original's (#420).*

Instead of the player who plays an 8 naming the suit, **the next player names
it** — and then plays against the suit they just named.

An 8 is [bad news either way](#eights-are-wild): a countdown while you hold it, a
stopped turn if you draw it, and a card gone when it goes. Under the standard
rule the suit is the one thing you get back for that — the reason an 8 is a card
you hope to place well rather than simply a card you lost. This rule takes it
away and hands it to the player your dead turn just passed to, who will name
something they can't follow and draw off the back of it.

That is the whole of the change, and it is bigger than it looks. Under the
standard rules an 8 is a bad card you can still do something with. Here it is
just a bad card.

### Dealer's Choice

*This game's own, not the original's (#420). The rule it varies — that a seed 8
is a [natural eight](#natural-eights) — is the original's.*

If the card turned up to start the game is an 8, the **dealer names the suit**
instead of it playing as a [natural eight](#natural-eights).

This is the only advantage dealing carries. It has no effect at all unless the
seed card happens to be an 8 — four cards in fifty-two, so roughly one game in
thirteen.

The lobby switch calls it **Dealer's Choice on Eight**, which puts that condition
in the name. It is this rule under a longer label, not a different one.

---

## Hands are face up

**Every hand is visible to everyone, all the time.** Around a real table the
cards are held up, not fanned in secret, and the app plays it the same way.

That is what makes the Sunny Rule a rule and not a guess: whether someone had a
play they skipped is there on the table to be seen. The app never marks up
another player's cards for you — and it won't mark up your own either, once
you've played a game. Spotting the play, and being able to point at it, is the
game.

## Asking for a hand

Your first game can be played with training wheels: the cards you can't play are
dimmed, and the app tells you whether you have a move. You are asked on the way
in whether you want them, and when that game ends they go away for good either
way.

After that, sit on a turn for five seconds and a quiet offer of help appears
next to your hand. Take it and the highlights come back — for that turn only,
and with a **"help!"** going up over your cards on every screen at the table.
The rule is always there when you need it. It is never there quietly.

---

## Where this departs from the original

goleta was a written game before it was an app, and the written rules are short.
Everything above is what this app actually does; this section is where the two
part company, and why. It is here because **every departure below reads as a bug
to somebody holding the original text** — and two of them are invisible in the
original game and only surface on a path this app invented, which is exactly the
sort of thing a fresh pair of eyes puts back.

**The original text lives in [`ORIGINAL-RULES.md`](ORIGINAL-RULES.md)**, exactly
as it was written, so you can check this reconciliation instead of trusting it.
[`HOW-TO-PLAY.md`](../HOW-TO-PLAY.md) says the same thing in plain English.

### What is unchanged

The spine of the game is the original's, to the letter: drawing only when you
cannot play, one card at a time, three at most; the drawn card that can be played
having to be played, ending the turn; the recycle when the deck runs out, and
carrying on with your draws afterwards so long as you are still stuck; the
offence being the **reach** rather than what comes back with it; the punishment
card coming from the hand that is left after the forced play, needing no legality
and being the offender's own choice; an uncalled offence being forgiven outright;
elimination on an empty hand, with play continuing and the last holder winning;
and a seed 8 playing as a [natural eight](#natural-eights).

### The departures

Each one was decided on purpose, and the issue that decided it is named. Do not
undo one because the original says otherwise — the original saying otherwise is
the point of this list.

1. **The turn does not end itself** (#260). The original ends it for you after
   three fruitless draws. Here it stays with you until you say you're done,
   because an automatic end shut the challenge window on the hardest reach to
   judge — the third, after which the offender is holding three more cards than
   the table has been reading. **This is the departure the next two hang off**: it
   creates a second way to commit the offence, one where nothing was drawn.
2. **The punishment card is slid under the pile rather than played on top of it**
   (#364). The original says *played as well*, and in the original that is a
   distinction without a difference: the offence is always a touch, so there is
   always a touched card flipped on top a moment later, and the punishment card is
   always buried. On the turn-ending path from departure 1 nothing buries it — so
   it was left as the card in play, letting the offender choose what the table
   matched next.
3. **A forced 8 names no suit.** The original says the skipped play is made *in
   the regular manner*, and the regular manner for an 8 is naming a suit.
   Buried in the original for the same reason as above; visible only on
   departure 1's path, where this game gives it its printed suit and no choice.
4. **A call has to name a card** (#50). The original just calls it. Naming one is
   what makes an accusation a specific claim that can be specifically wrong, and
   it is what replaced the card forfeit below.
5. **A wrong call costs a three-reach lockout** (#50). The original has **no
   wrong-call penalty at all**. The lockout exists only because a call still needs
   some brake; it is deliberately not a card.
6. **The window outlives the offender's turn.** The original closes it *at the
   time of offense*; here it closes on the **next player's first action**, and the
   turn is rewound if a call lands after play has moved on. That width is what
   makes remembering the board a real cost, which is the difficulty
   [naming the card](#naming-the-card) is built on (#318).
7. **A call rewinds every card drawn since the first illegal reach**, not just the
   one touched. The original flips the touched card, singular, and forgives
   anything already got away with. Returning the lot means being caught on your
   third steal does not leave you two cards ahead of an honest turn.

### Where the original is silent

These had to be answered for a game that runs itself, and the original does not
rule on any of them.

- **Natural eights beyond the seed card.** The original's footnote covers only the
  card that starts the game. This game extends it to every card turned up off the
  deck — the recycle, and the flip after a call — on the reasoning that the
  distinction is simply whether a hand was involved.
- **Reaching for an empty deck.** Still an offence, because the reach is the
  offence; otherwise an empty deck would be a free way to touch it while holding a
  play. With nothing touched to turn up, the pile is recycled instead.
- **[Deadlock](#deadlock).** Nobody able to play and nothing to draw: the largest
  hand wins. It exists so the game cannot simply stop.
- **Two calls at once.** The first to arrive is judged; the rest cost nothing.
- **A player who is out cannot call.** They have left the game, so they are not
  one of the *other players* the original empowers.

### And two alternates this game added

Not departures — both are off by default, so the game as written is untouched by
them — but they are **not the original's either**, which this file claimed until
#420. [The Power of Eights](#the-power-of-eights) and
[Dealer's Choice](#dealers-choice) were invented here and headed *"From the
original written rules"* for as long as that section existed, which put the one
document whose job is telling *ours* from *theirs* two rules out.

Dealer's Choice is the subtler half of the correction: the rule it varies — that
a seed 8 plays as a [natural eight](#natural-eights) — **is** the original's,
written into its only footnote. The option to override it is not.
