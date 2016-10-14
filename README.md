# EDI IFTMIN and IFTSTA

So that's basically these specifications here:
[UN/EDIFACT IFTMIN](http://www.unece.org/trade/untdid/d03a/trmd/iftmin_c.htm) and
[UN/EDIFACT IFTSTA](http://www.unece.org/trade/untdid/d04b/trmd/iftsta_c.htm).

## How to use

This is how you parse EDI files:

```
var ediParser = require('edi-iftmin');

// first load the raw EDI file into memory
var rawEdi = fs.readFileSync('./some-edi-file', 'utf8');

// this parses the raw EDI message and creates a nice JSON object for you to use
var edi = ediParser.parseEdi(rawEdi);
```

Then you can inspect it to see what information is in there.

```
ediParser.inspectEdi(edi);
```

*Quick sidenote*: You can drop files you want to inspect in `test/testfile` and run `cd test && node test.js` to use our prepared inspector.

This will print a structure of the EDI file to your console showing all messages, e.g. like this:

```
Message 0
  UNH: Message header (raw: UNH+553416+IFTMIN:2:912:UN)
    010: Message reference number # 553416
    020 # IFTMIN:2:912:UN
      0 # IFTMIN
      1 # 2
      2 # 912
      3 # UN
  BGM: Beginning of message (raw: BGM+700:::ZFT+663424234)
    010: Document/message name # 700:::ZFT
      0 # 700
      1
      2
      3 # ZFT
    020 # 663424234
  LOC: Place/location identification
    36:GB: 36:GB (raw: LOC+36:GB)
      010: Location function code qualifier # 36:GB
        0 # 36
        1 # GB
```

This gives you a better understanding of what's in there, and you can also extract it like this, e.g. if you want to extract the message number `663424234`.

```
ediParser.selectWithPath(edi, 'BGM.020.value');
```
