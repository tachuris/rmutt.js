{

  function extractList(list, index) {
    var result = new Array(list.length), i
    for (i = 0; i < list.length; i++) {
      result[i] = list[i][index]
    }
    return result
  }

  function buildList(first, rest, index) {
    return [first].concat(extractList(rest, index))
  }

  var nextId = 0

}


Grammar
  = Statement+

Statement
  = _ match:(Include / StatementBlock) _ {
    return match
  }

Comment "comment"
  = '//' NonLineTerminator* LineTerminatorSequence

StatementBlock
  = match:(Package / Import / Rule) _ ';' {
    return match
  }

Package
  = 'package' _ match:Identifier {
    return { type: 'Package', name: match }
  }

Import "import"
  = 'import' _ rules:Imports _ 'from' _ from:Identifier {
    return { type: 'Import', rules: rules, from: from }
  }

Imports "imports"
  = first:Identifier rest:(_ ',' _ Identifier)* {
    return buildList(first, rest, 3)
  }

Include
  = '#include' _ '"' match:Path '"' {
    return { type: 'Include', path: match }
  }

Path "path"
  = match:[a-z0-9/_\-.]+ {
    return match.join('')
  }

Rule "rule"
  = name:Identifier _ '[' _ args:ArgumentNames _ ']' _ ':' _ expr:Body? {
    return { type: 'Rule', name: name, expr: expr, args: args }
  }
  / name:Identifier _ ':' _ expr:Body? {
    return { type: 'Rule', name: name, expr: expr }
  }
  / name:Identifier _ '=' _ expr:Body? {
    return { type: 'Assignment', name: name, expr: expr }
  }

ArgumentNames "argument names"
  = first:ArgumentName rest:(_ ',' _ ArgumentName)* {
    return buildList(first, rest, 3)
  }

ArgumentName "argument name"
  = Identifier

Body "body"
  = CodeBlock
  / ChoicesComma
  / ChoicesPipe
  / QuantifiedTerms

CodeBlock "code block"
  = '{' code:Code '}' {
    return { type: 'CodeBlock', code: code }
  }

Code
  = $((![{}] .)+ / '{' Code '}')*

ChoicesComma
  = mode:ChoosingMode _ first:QuantifiedTerms? rest:(_ ',' _ QuantifiedTerms?)+ {
    return { type: 'Choices', items: buildList(first, rest, 3), mode: mode, id: nextId++ }
  }

ChoicesPipe
  = mode:ChoosingMode _ first:QuantifiedTerms? rest:(_ '|' _ QuantifiedTerms?)+ {
    return { type: 'Choices', items: buildList(first, rest, 3), mode: mode, id: nextId++ }
  }

ChoosingMode
  = match:'&'* {
    switch (match.join('')) {
      case '&':
        return 'shuffle'
      case '&&':
        return 'reshuffle'
      default:
        return 'any'
    }
  }

QuantifiedTerms
  = expr:Terms? _ quantifier:(Probability / Integer)? {
    if (quantifier == null || quantifier == 1) return expr
    return { type: 'Quantified', expr: expr, quantifier: quantifier }
  }

Probability "probability"
  = "0." match:(DecimalDigit+) {
    return +("0." + match.join(''))
  }

Terms
  = first:QualifiedTerm rest:(_ QualifiedTerm)* {
    var items = buildList(first, rest, 1)
    if (items.length == 1) {
      return items[0]
    }
    return { type: 'Terms', items: items }
  }

QualifiedTerm
  = term:Term !([?*+>{] / _ '>' / _ '{') {
    return term
  }
  / term:Term '?' {
    return { type: 'Repetition', expr: term, range: { min: 0, max: 1 } }
  }
  / term:Term '*' {
    return { type: 'Repetition', expr: term, range: { min: 0, max: 5 } }
  }
  / term:Term '+' {
    return { type: 'Repetition', expr: term, range: { min: 1, max: 5 } }
  }
  / term:Term _ '{' _ min:Integer _ ',' _ max:Integer _ '}' {
    return { type: 'Repetition', expr: term, range: { min: min, max: max } }
  }
  / term:Term _ '{' _ times:Integer _ '}' {
    return { type: 'Repetition', expr: term, range: { min: times, max: times } }
  }
  / expr:Term _ '>' _ func:QualifiedTerm {
    return { type: 'Transformation',  expr: expr, func: func }
  }

Term
  = '(' _ match:Body _ ')' { return match }
  / '(' _ match:ScopedRule _ ')' { return match }
  / Invocation
  / Mapping
  / RegExpMapping
  / StringLiteral

Mapping
  = search:StringLiteral _ '%' _ replace:QualifiedTerm? {
    return { type: 'Mapping', search: search, replace: replace }
  }
  / '/' search:RegExpContent '/' _ '%' _ replace:QualifiedTerm? {
    return { type: 'Mapping', search: search, replace: replace }
  }

RegExpMapping
  = '/' search:RegExpContent '/' replace:RegExpContent '/' {
    return { type: 'Mapping',  search: search, replace: replace }
  }

RegExpContent
  = chars:('\\/' / [^/])* {
     return chars.join('');
  }

ScopedRule
  = rule:Rule {
    rule.scope = 'local'
    return rule
  }
  / '^' rule:Rule {
    rule.scope = 'parent'
    return rule
  }
  / '$' rule:Rule {
    rule.scope = 'root'
    return rule
  }

Invocation "rule invocation"
  = prefix:'@'? name:RuleName args:(_ '[' _ Arguments _ ']')? {
    if (args == null) {
      return { type: 'Invocation', name: name, prefix: prefix }
    } else {
      return { type: 'Invocation', name: name, prefix: prefix, args: args[3] }
    }
  }

RuleName "rule name"
  = ns:('$'? Identifier '.')? name:Identifier {
    if (ns == null) return name
    return ns.join('') + name
  }

Arguments "arguments"
  = first:Argument rest:(_ ',' _ Argument?)* {
    return buildList(first, rest, 3)
  }

Argument "argument"
  = ChoicesPipe
  / Terms

Integer "integer"
  = match:DecimalDigit+ {
    return +match.join('')
  }

Identifier "identifier"
  = start:[_a-z]i rest:[a-z0-9\-_]i* {
    return start + rest.join('')
  }

_
  = (' ' / '\t' / Comment / LineTerminatorSequence)*


/*
 * https://github.com/dmajda/pegjs/blob/master/examples/javascript.pegjs
 */

LineTerminator
  = [\n\r\u2028\u2029]

NonLineTerminator
  = [^\n\r\u2028\u2029]

LineTerminatorSequence "end of line"
  = "\n"
  / "\r\n"
  / "\r"
  / "\u2028" // line separator
  / "\u2029" // paragraph separator

StringLiteral "string"
  = parts:('"' DoubleStringCharacters? '"' / "'" SingleStringCharacters? "'") {
      return parts[1] || '';
    }

DoubleStringCharacters
  = chars:DoubleStringCharacter+ { return chars.join(""); }

SingleStringCharacters
  = chars:SingleStringCharacter+ { return chars.join(""); }

SourceCharacter
  = .

DoubleStringCharacter
  = !('"' / "\\" / LineTerminator) char_:SourceCharacter { return char_;     }
  / "\\" sequence:EscapeSequence                         { return sequence;  }
  / LineContinuation

SingleStringCharacter
  = !("'" / "\\" / LineTerminator) char_:SourceCharacter { return char_;     }
  / "\\" sequence:EscapeSequence                         { return sequence;  }
  / LineContinuation

LineContinuation
  = "\\" sequence:LineTerminatorSequence { return sequence; }

EscapeSequence
  = CharacterEscapeSequence
  / "0" !DecimalDigit { return "\0"; }
  / HexEscapeSequence
  / UnicodeEscapeSequence

CharacterEscapeSequence
  = SingleEscapeCharacter
  / NonEscapeCharacter

SingleEscapeCharacter
  = char_:['"\\bfnrtv] {
      return char_
        .replace("b", "\b")
        .replace("f", "\f")
        .replace("n", "\n")
        .replace("r", "\r")
        .replace("t", "\t")
        .replace("v", "\x0B") // IE does not recognize "\v".
    }

NonEscapeCharacter
  = (!EscapeCharacter / LineTerminator) char_:SourceCharacter { return char_; }

EscapeCharacter
  = SingleEscapeCharacter
  / DecimalDigit
  / "x"
  / "u"

HexEscapeSequence
  = "x" h1:HexDigit h2:HexDigit {
      return String.fromCharCode(parseInt("0x" + h1 + h2));
    }

UnicodeEscapeSequence
  = "u" h1:HexDigit h2:HexDigit h3:HexDigit h4:HexDigit {
      return String.fromCharCode(parseInt("0x" + h1 + h2 + h3 + h4));
    }

HexDigit
  = [0-9a-fA-F]

DecimalDigit
  = [0-9]
