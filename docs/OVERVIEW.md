## Overview

### What is rmutt.js?

**rmutt.js** is a tool for generating random text from
[context-sensitive grammars](https://en.wikipedia.org/wiki/Context-sensitive_grammar). It's a reimplementation of the C project
[rmutt](http://sourceforge.net/projects/rmutt/) by Joe Futrelle,
which in turn is modeled after Andrew C. Bulhak's late, great
[Dada Engine](http://dev.null.org/dadaengine/) which he used
to write the hilarious [Postmodernism Generator](https://en.wikipedia.org/wiki/Postmodernism_Generator).
**rmutt.js** grammar is backward compatible with the original **rmutt**, but adds features inspired by Dada Engine such as [indirection](./GUIDE.md#indirection) and JavaScript platform capabilities, like [embedded code](./GUIDE.md#embedded-code) and [external rules](./API.md#expander-options-externals).

The original **rmutt** was named after Marcel Duchamp's alter-ego Richard Mutt, who is responsible for the "urinal" ready-made, an infamous dadaist art prank. **rmutt** is not to be confused with the UNIX mail-reader [mutt](http://www.mutt.org/).

### What rmutt does and how

**rmutt** takes as input a set of user-supplied grammatical rules, each of which represents a set of choices that can be made at a particular level of grammatical description. For instance a grammar might specify that a "person" can be either "Fred" or "Jennifer". **rmutt** then makes these choices randomly, resulting in text which conforms to the grammar but is otherwise unpredictable.

Grammars in **rmutt** need not relate in any way to the grammar of any human language. For instance, **rmutt** can be used to generate text instructions for producing graphics or music.

**rmutt** is similar to the Dada Engine, in that its grammars can be made context-sensitive by means of variable assignment and/or grammar self-modification. For instance a choice made in one rule may affect the definition of another rule. Also, textual transformations can be applied to the output of rules using regular expressions, by which means a rule can modify the output of more than one other rule. This is a bit like Chomsky's notion of a [transformational grammar](https://en.wikipedia.org/wiki/Transformational_grammar).

### A simple example

Here's a simple **rmutt** grammar. For an explanation of the syntax, see the [user's guide](GUIDE.md).

```coffeescript
s: np " " vp ".";
np: art " " noun, propn;
art: "the", "a";
noun: "cat", "dog";
propn: "Joe", "Beth";
vp: iv, tvp;
iv: "meowed", "barked";
tvp: tv " " np;
tv: "scolded", "loved";
```

Each rule has a name and is defined as a set of choices, separated by commas. Each choice is defined as a sequence of either the name of a rule to invoke at that point in the grammar, or a literal string to print out. In the first rule, `s` is defined as an `np` followed by a space followed by a `vp` followed by a period. In the second rule, `np` is defined as either an `art` followed by a space followed by a `noun`; or a `propn`. And so on.

Here are some sample strings **rmutt** produced with this grammar:

```
Joe barked.
a cat scolded the dog.
Joe loved the dog.
Beth scolded Beth.
Beth meowed.
Joe loved a dog.
a dog barked.
```

You can see that the output at each point depends on which rules have been invoked as **rmutt** traverses the hierarchy of choices. Now let's add something simple to demonstrate that the rules need not have a strict hierarchical relationship to one another. In this example we add a `tvp` which includes an `s`:

```coffeescript
s: np " " vp ".";
np: art " " noun, propn;
art: "the", "a";
noun: "cat", "dog";
propn: "Joe", "Beth";
vp: iv, tvp;
iv: "meowed", "barked";
tvp: tv " " np , "said that " s;
tv: "scolded", "loved";
```

This kind of circularity is perfectly legal in **rmutt**. Here are some example strings produced by this grammar:

```
Joe scolded Beth.
Beth said that Joe meowed..
a cat barked.
a dog said that a cat meowed.
Beth said that a cat said that Joe said that the dog meowed....
```

Notice that in the last example string, the top-level `s` contained an `s` which contained its own `s` which itself contained an `s`. This is allowable according to the grammar, since any `s` may contain another `s`. In fact, **rmutt** would run forever like this if there were no choices available to it that did not contain the embedded `s`. Do you see a problem with the grammar? There are multiple periods after the examples with "said that" in them. This is because there's a period in the definition of `s`, so any string containing more than one `s` will have multiple periods in it. That can be fixed in the following manner:

```coffeescript
top: s ".";
s: np " " vp;
np: art " " noun, propn;
art: "the", "a";
noun: "cat", "dog";
propn: "Joe", "Beth";
vp: iv, tvp;
iv: "meowed", "barked";
tvp: tv " " np, "said that " s;
tv: "scolded", "loved";
```

This simple example is just a hint of what **rmutt** can do. For more information see:

- The [user's guide](GUIDE.md).
- The [command-line interface documentation](CLI.md).
- The [JavaScript API documentation](API.md).
- Find inspiration in the [example grammars](../examples/).

---

> _This overview is mostly based on the [original rmutt documentation](https://web.archive.org/web/20140218115250/http://www.schneertz.com/rmutt) by Joe Futrelle._
