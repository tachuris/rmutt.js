## Using rmutt.js

First, you need to provide a grammar to **rmutt.js** via:

- The [command-line interface](CLI.md)
- The [JavaScript API](API.md)

But, how to write a grammar?

## Writing rmutt grammars

Grammars in **rmutt** consist primarily of rules. Rules are _named_ and specify which choices are allowable at a given point in the grammar. To do this, they can either include literal text which **rmutt** will output, or they can refer to other rules. The simplest rule simply associates a name with some literal text:

```coffeescript
day: "Thursday";
```

This tells **rmutt** to produce the string "Thursday" every time it encounters the `day` rule. So for instance if **rmutt** encountered the rule:

```coffeescript
announcement: "I'm leaving on " day;
```

would produce

```
I'm leaving on Thursday
```

In the example, the literal "I'm leaving on " is followed by the term `day`, which tells **rmutt** to look up the rule named `day` to determine what to output next.

### Choices

A rule can contain more than one allowable choice. Choices are separated by commas. So for instance if we change our first rule to:

```coffeescript
day: "Thursday", "Friday" , "Saturday";
```

then the `announcement` rule could also produce

```
I'm leaving on Friday
```

or

```
I'm leaving on Saturday
```

**rmutt** chooses randomly, so there's no way to predict which choice it will make for any given rule.

### Anonymous rules

Sometimes it's inconvenient to define a new rule every time you want **rmutt** to make a choice. To make this more convenient, **rmutt** allows for anonymous rules which may be used anywhere in a rule. They're set off by parentheses. For example, we could rewrite our announcement rule as follows:

```coffeescript
announcement: "I'm " ("leaving" , "staying") " tomorrow";
```

**rmutt** will either produce

```
I'm leaving tomorrow
```

or

```
I'm staying tomorrow
```

In case you're wondering, this has exactly the same behavior as the following two rules:

```coffeescript
announcement:  "I'm " sol " tomorrow";
sol: "staying", "leaving";
```

Anonymous rules can be nested arbitrarily deeply, as in this example:

```coffeescript
brag: "I have a " (("cool" , "fast") " car", ("great", "winning") " personality") "!";
```

### Repetition

**rmutt** allows you to control how many times to repeat each part of a rule by specifying a minimum and maximum number of allowable repetitions. This is done with the "repetition qualifier" in the form `{min,max}` to specify a minumum and maximum number of repetitions or simply `{num}` to specify an exact number of repetitions. For example, the following rule:

```coffeescript
howfar: "very, "{3,4} "far away";
```

might produce:

```
very, very, very, far away
```

The repetition notation can be applied to non-literals as well. For instance, it could be applied to the invocation of another rule:

```coffeescript
howfar: emph{3,4} "far away";
emph: "very, ", "really, ", "extremely, ";
```

might produce:

```
really, really, extremely, really, far away
```

Just as parentheses can be used for anonymous rules, they can also be used to group terms so that the repetition qualifier can be applied to the group. For example we can rewrite our following example like so:

```coffeescript
howfar: (emph ", "){3,4} "far away";
emph: "very", "really" , "extremely";
```

which saves us having to include the comma in each choice for `emph`, since we've grouped it with the invocation of `emph` in the first rule.

### Shorthand repetition qualifiers

There are three shorthand repetition qualifiers that you can use in place of the braces notation. They are as follows:

```
?	{0,1}
*	{0,5}
+	{1,5}
```

### Context-dependent behavior: Embedded definitions

In **rmutt**, a rule can change the definition of another rule or define a new rule. This makes certain kinds of context-dependent behavior easier to implement. For instance, suppose you had the following fragmentary English grammar:

```coffeescript
vp: iv " " adv " " pp;
iv: "ate", "yelled", "waited";
pp: prep " " obj;
prep: "to", "at", "for", "on";
obj: "you", "me";
adv: "patiently", "impatiently";
```

Here we've specified that a verb phrase (`vp`) consists of an intransitive verb (`iv`) followed by an adverb (`adv`) followed by a prepositional phrase (`pp`). As this grammar stands, however, it can produce non-idiomatic combinations of verbs and prepositions, such as "ate patiently at you" or "waited impatiently to me". To fix this, we need the `prep` rule to change based on which verb was selected. This can be done by embedding the definitions of `iv` and `prep` in choices together:

```coffeescript
meta-vp:
(iv: "ate") (prep: "with") vp,
(iv: "yelled") (prep: "at") vp,
(iv: "waited") (prep: "for","on","with") vp;
vp: iv " " adv " " pp;
pp: prep " " obj;
obj: "you", "me";
adv: "patiently", "impatiently";
```

This new grammar can produce the following strings:

```
ate patiently with me
waited impatiently for you
yelled patiently at you
```

but not:

```
waited patiently at me
ate impatiently at you
yelled patiently on me
```

Embedded definitions are surrounded by parentheses, and are otherwise the same as top-level definitions. They may occur anywhere in a choice for a rule, since they produce no output. There's no limit to the number of embedded rules that a rule can contain, or to the complexity of embedded rules.

The scope of rules defined by embedded definitions is lexical by default. In other words, as **rmutt** proceeds from left to right producing strings satisfying each grammatical unit in the sequence of units associated with a choice, any embedded rule definitions it encounters will be in effect from that time forward, but only in the subtree in which the embedded definition occurs.

The scope of an embedded definition can be controlled with the scope qualifier "$". If you place this qualifier in front of the label of an embedded rule, it will modify any existing binding for that label, rather than creating a new local binding. See the Turing machine example for an example of this syntax.

### Context-dependent behavior: Variables

Variables are another way to implement context-dependent behavior. A variable is like an embedded rule whose choices are only made once. Every time the variable is invoked, it will produce the same string. Variable assignments are indicated with an equals sign (=). For instance, the following grammar:

```coffeescript
s: (character = name, position) character " said, 'I am " character ", so nice to meet you.'";
name: title " " firstName " " lastName;
title: "Dr.", "Mr.", "Mrs.", "Ms";
firstName: "Nancy", "Reginald", "Edna", "Archibald";
lastName: "McPhee", "Eaton-Hogg", "Worthingham";
position: "the butler", "the chauffeur";
```

can produce the following strings:

```
Ms Reginald Worthingham said, 'I am Ms Reginald Worthingham, so nice to meet you.'
```

```
Mr. Edna Worthingham said, 'I am Mr. Edna Worthingham, so nice to meet you.'
```

```
the butler said, 'I am the butler, so nice to meet you.'
```

```
Mrs. Nancy McPhee said, 'I am Mrs. Nancy McPhee, so nice to meet you.'
```

Like embedded definitions, variable assignments are surrounded by square brackets, and are otherwise the same as top-level definitions. They may occur anywhere in a choice for a rule, since they produce no output.

The scope of variable assignments is lexical, just like embedded definitions. In fact, a variable assignment is just a degenerate form of rule definition which only allows one choice per rule.

As with embedded definitions, the scope of the assignment can be controlled with the "$" scope qualifier.

<a name="indirection"></a>

### Context-dependent behavior: Indirection

Indirection allows the output of a rule to be used as the name of another rule. This is useful when the ranges of valid choices are influenced by a prior choice. For example, the following script:

```coffeescript
start:  sentence-about[animal];
animal: "dog", "cat";
sentence-about[subject]: @subject " is a " subject;
dog: "Fido", "Spot";
cat: "Tiddles", "Fluffy";
```

may produce the sentences "Spot is a dog" or "Fluffy is a cat", but will never produce "Spot is a cat". When `sentence-about` is evaluated, subject is set to either "dog" or "cat"; when the first term is evaluated, **rmutt** uses it as the name of a rule and either evaluates the rule named dog or the one named cat.

### Transformations: Mappings

In addition to controlling what text is produced by a complex of rules, you can also apply transformations to the text produced by rules and parts of rules. Transformations are indicated with a right angle bracket which points from the rule part to the transformation which is to be applied to its output.

The simplest form of transformation is a mapping, which produces a substitute value if the value to be transformed exactly matches a given string. For instance the mapping:

```coffeescript
scaryAnimal: animal > "fish" % "shark";
animal: "fish", "cat";
```

produces either "cat" or "shark". Mappings are indicated with a percent sign (`%`). Mappings can be grouped either by defining them as named rules or enclosing them in parentheses. For instance, the grammar

```coffeescript
scaryAnimal: animal > ("fish" % "shark" "cat" % "lion");
animal: "fish", "cat";
```

produces either "shark" or "lion". We could also name the transformation by defining it as a rule:

```coffeescript
scaryAnimal: animal > makeScary;
animal: "fish", "cat";
makeScary: "fish" %"shark" "cat" % "lion";
```

Mappings are useful for setting up associations between choices. For instance the following example maps basketball team names to the cities they're from:

```coffeescript
s: (myteam = team) "The " myteam " are from " myteam > team2city;
team: "Sparks", "Comets";
team2city: "Sparks" % "L.A." "Comets" % "Houston";
```

which can produce the following strings:

```
the Sparks are from L.A.
the Comets are from Houston
```

### Transformations: Regular Expressions

For the die-hard UNIX hacker inside each of us, **rmutt** allows regular expression substitutions to be used as transformations. A discussion of regular expressions is beyond the scope of this document. There are many useful resources on the web to help learn them. A good starting place is A Tao of Regular Expressions. One warning: the syntax of regular expressions differs significantly from application to application. **rmutt** uses POSIX extended regular expressions. If you don't know what that means, beware!

Regular expression substitutions are written in the form `/reg. exp./replacement/`. Here's a simple example of regular expression substitution:

```coffeescript
s: "i like to eat apples and bananas" > /[aeiou]/oo/;
```

this produces:

```
oo lookoo too oooot oopploos oond boonoonoos
```

Like mapping transformations, regular expression transformations can be defined as rules or enclosed in parentheses.

### Transformations: Chaining

Any transformation can be applied to the result of a previous transformation by transformation chaining. This is indicated simply by using a transformation as the left-hand-side of another transformation, like so:

```coffeescript
thing: "cat" > /t/b/ > "cab" % "taxi";
```

The grammar above will produce "taxi". Transformation chains can be arbitrarily long. For instance, the following grammar

```coffeescript
thing: name > deleteVowels > slangify > deleteVowels;
deleteVowels: /[aeiou]//;
slangify: "chck" % "chiggidy" "snp" % "snippidy";
name: "check", "chuck", "snap", "snipe";
```

will produce either "chggdy" or "snppdy".

### Packages

When a grammar has many rules and variables in it, it's difficult to keep track of their names and make sure that each name is unique. This is especially a problem when combining two grammars that may have been developed independently. To solve this problem, **rmutt** uses "packages", requiring only that each name be unique within a package. To switch to a particular package, use the `package` statement:

```coffeescript
package greeting;

s: "hello there " o;
o: "beautiful", "Mr. Smarty Pants";
```

This means that `s` and `o` are to be understood as names within the package called `greeting`. Outside of the package, each rule must be referred to by its "fully qualified" name, which consists of the package name, followed by a period, followed by the unqualified name (e.g. `greeting.s`).

Here's how we can use two packages in the same grammar:

```coffeescript
package lesson;

sentence: o " starts with the letter 'O', " greeting.o;
o: "oatmeal", "ogre";

package greeting;

s: "hello there " o;
o: "beautiful", "Mr. Smarty Pants";
```

Notice that in the first rule we're using the fully-qualified name `greeting.o` to indicate that we want to use the definition of `o` from the `greeting` package and not from the `lesson` package. This grammar might generate the following strings:

```
ogre starts with the letter 'O', beautiful
ogre starts with the letter 'O', Mr. Smarty Pants
```

Before the first package statement in a grammar, **rmutt** considers names to be in the default package, which is a package with no name. The disadvantage of using this package is that there is no fully-qualified name for any rule or variable from the default package, since all names in **rmutt**, including package names, must be at least one character long. If you use a name in a package, **rmutt** will first search the current package for that name, and if it can't find it there will then search the default package.

### Includes

If you're familiar with C or C++, you'll recognize **rmutt**'s syntax for merging two or more grammar files. Suppose you've written a grammar that generates random email addresses, which you've stored in a file called `email.rm`, and you'd like to reuse it in another grammar. The following example shows how to do this.

```coffeescript
#include "email.rm"

sentence: "my email address is " email_addr "\n";
```

In this example, the `email_addr` rule from email.rm is used. When you use an include, take care that the included file does not define rules with the same names as rules you have defined in the including grammar, or whichever definition occurs last will override the previous definition. You can avoid these problems by using packages.

Includes can occur anywhere in a grammar.

### Shuffling

Consider the following grammar:

```coffeescript
top: paragraph{4};
paragraph: transition_adverb sentence ".\n";
transition_adverb: "also", "moreover", "in addition", "furthermore", "additionally";
sentence: "some sentence";
```

With some (really bad) luck, we could get the result:

```
moreover some sentence.
moreover some sentence.
moreover some sentence.
moreover some sentence.
```

This is an extreme example, but even one consecutive repetition of adverbs starting paragraphs could look unnatural. This gets more probable with shorter lists of choices.

To achieve more variety, we can specify a shuffle behavior using the `&` prefix. This will prepare a random permutation cycle for the list in order to avoid repeated consecutive items. This way we can ensure we never get a result like above. For example:

Thus:

```coffeescript
top: paragraph{6};
paragraph: transition_adverb sentence ".\n";
transition_adverb: & "also", "furthermore", "additionally";
sentence: "some sentence";
```

would generate:

```
furthermore some sentence.
also some sentence.
additionally some sentence.
furthermore some sentence.
also some sentence.
additionally some sentence.
```

Using the `&&` prefix, the list will be shuffled again when the choices are used up.

Shuffling modes can be nested:

```coffeescript
  t: (s{4} " "){6};
  s: & "0","1","2",(&& "x","y","z");
```

would produce combinations like this:

```
10z2 10y2 10x2 10x2 10z2 10y2
```

### Probability quantifiers

A choice can be followed by an optional probability quantifier, which may increase or decrease the probability that it will be selected, relative to other choices in the same list. For shuffled choices, it will affect the order of the permutation (the probability of being in the first places).

A quantifier consists of a real lower than 1 (probability) or an integer greater than 1 (multiplier) at the end of a choice. For instance

```coffeescript
number: digit{16};
digit: "0" 9, "1";
```

will produce a string of 16 zeros and ones, which is likely to consist mostly of zeroes. Probability multipliers are a shorthand for repeatedly adding a choice to the rule. The above grammar is equivalent to but more space efficient than the following one:

```coffeescript
number: digit{16};
digit: "0", "0", "0", "0", "0", "0", "0", "0", "0", "1";
```

It's also equivalent to

```coffeescript
number: digit{16};
digit: "0", "1" 0.1;
```

This is, given a total probability of 1, "1" has probability 0.1 and "0" has the remaining probability (0.9)

Probabilities and multipliers can be combined. For example:

```coffeescript
number: digit{16};
digit: "0" 2, "1" 0.1, "2";
```

This is, out of 4 choices ("0" counts twice):

- "1" got 0.1 probability, as specified
- the remaining 0.9 (total probability is 1) is distributed among 3 choices (0.3 each)
- "0" got 0.6 (0.3 multiplied by 2, as specified)
- "2" got 0.3 (the remaining)

### Embedded code

Blocks of JavaScript code may be embedded in rules. These should return a result.

Rule arguments are available as local variables:

```coffeescript
top: fn["1","2","3"];
fn[a, b, c]: {
  return c + b + a;
};
```

It's possible to use anonymous code blocks:

```coffeescript
top: "1+2=" ({ return 1+2 });
```

Also, a transformation can be defined using embedded code:

```coffeescript
top: "abcd" > (asciify["b"] "c"%"x" asciify["d"]);
asciify[char]: {
  return function (input) {
    return input.replace(char, char.charCodeAt(0));
  };
};
```

### Template strings

Backticks delimit a template string, also called a template literal or backtick string. A template string can span multiple lines, and can interpolate any rmutt expression with `${...}`:

```coffeescript
note: `Hi ${name},

The ${thing} is ${status}.
`;
name: "Ada", "Grace";
thing: "build", "release";
status: "green", "still red";
```

Without template strings, the same rule must escape its line breaks and juxtapose separate strings:

```coffeescript
note: "Hi " name ",\n" "\n" "The " thing " is " status ".\n";
```

An interpolation accepts anything a rule body accepts, including choices, groups, repetition, other template strings, and embedded code:

```coffeescript
top: `${"Hello"|"Hi"} there. 1+2=${{ return 1+2 }}`;
```

A template string always produces a string. An interpolation that produces a value of any other type contributes nothing to the result.

A template string behaves like any other term, so you can repeat it, transform it, or use it as the replacement side of a mapping. You can't use it as the search side, which must be a literal: `` `a`%"b" `` works, but `` `a${x}`%"b" `` is an error.

For a complete example, see [examples/template.rm](../examples/template.rm), which prints the same note twice, once in each style.

## Other important things

### Entry point

By default, **rmutt** invokes the first rule in its input. Think of this as the "entry point" for your grammar. This is configurable from the [CLI](CLI.md) and the [API](API.md).

<a name="options-package"></a>

### $options package

This is a virtual package that gives access to the current options object.
This can be useful, for example, to render a permament link to the generated document
passing the seed value of the random number generator.

```coffeescript
#include "recipe.rm"

top: RECIPE permanent_link;
permanent_link: "<p><a href=\"http://randomrecipes.com/?seed=" $options.randomSeed "\">Permanent link</a></p>";
```

### Line breaks

- All top-level rules and package statements must end in a semicolon (`;`).

- Line breaks are not significant; you may use them whenever is convenient.

### Circular references

**rmutt** cannot detect certain kinds of errors; in particular, if your grammar is endlessly recursive, like so:

```coffeescript
deadly: embrace;
embrace: deadly;
```

**rmutt** will run out of memory and silently fail as it tries to make an infinitely-long string. To mitigate this you can use the `-s` command line option, which sets a limit on the recursion depth. Past the limit, rules will simply fail to expand. For instance if the file `foo.rm` contained the following grammar:

```coffeescript
foo: "yes" bar;
bar: foo;
```

and you ran the following command:

```
rmutt -s 20 foo.rm
```

you'd get this output:

```
yesyesyesyesyesyesyesyesyesyes
```

### Transformations with repetition

Repetition can be combined with transformations, but the repetition qualifier must come last, like this:

```coffeescript
aRule: "clam" > /m/mp/ {2,10};
```

not

```coffeescript
aRule: "clam" {2,10} > /m/mp/;
```

if you want the repetition to be applied before the transformation, you need to enclose the term and repetition qualifier in parentheses:

```coffeescript
aRule: ("clam"{2,10}) > /mc/m, c/ "!";
```

### Comments

Comments can be included in **rmutt** grammars. If two slashes in a row (`//`) occur anywhere on a line, the rest of the line is treated as a comment and ignored.

### Special characters

To include special characters in literals, use the following notations:

```
Double quotes	\"
Newline	\n
Tab	\t
Backslash	\\
Curiosities
```

The same notations work inside [template strings](#template-strings), where the delimiters escape too: `` \` `` for a backtick and `\$` for a dollar sign that would otherwise start an interpolation.

### Turing-complete

Even without using embedded or external JavaScript code, **rmutt** is Turing-complete. [Here](../examples/turing.rm) is an implementation of a Turing machine in **rmutt**.

---

> _This guide is mostly based on [the original rmutt documentation](https://web.archive.org/web/20120208110629/http://www.schneertz.com/rmutt/docs.html) by Joe Futrelle._

> _"Indirection" section is adapted from [The Dada Engine manual](http://dev.null.org/dadaengine/manual-1.0/dada.html) by Andrew C. Bulhak._
