var _ = require('underscore');
var yaml = require('js-yaml');
var fs = require('fs');

// Get document, or throw exception on error
try {
  var _c = yaml.safeLoad(fs.readFileSync(__dirname + '/config.yml', 'utf8'));
} catch (e) {
  throw e;
}

///////////////////////
// Utility Functions //
///////////////////////

function clone(object) {
  var string = JSON.stringify(object);
  if (typeof string !== 'undefined') return (JSON.parse(string));
  else return null;
}

function select(object, selector) {
  var path = selector.split('.');
  var obj = clone(object);
  for (var i = 0; i < path.length; i++) {
    if (_.has(obj, path[i])) obj = obj[path[i]];
    else return null;
  }

  return obj;
}

function insert(object, selector, value) {
  var path = selector.split('.');
  var obj = object;
  for (var i = 0; i < path.length; i++) {
    if (!_.has(obj, path[i]) && i < path.length - 1) {
      obj[path[i]] = {};
      obj = obj[path[i]];
    } else if (!_.has(obj, path[i]) && i === path.length - 1) obj[path[i]] = value;
    else if (_.has(obj, path[i]) && i === path.length - 1) obj[path[i]] = value;
    else if (_.has(obj, path[i]) && i < path.length - 1) obj = obj[path[i]];
  }
}

function printWithIndent(indent, string) {
  var indentation = '';
  for (var i = 0; i < indent; i++) {
    indentation += '  ';
  }

  console.log(indentation + string);
}

function isValid(value) {
  return !_.isNull(value) && !_.isUndefined(value) && value !== '';
}

///////////////////
// EDI Functions //
///////////////////

function splitIntoInterchanges(edi) {
  return edi.match(/UNB\+.*?UNZ\+[^\']*\'+?/g);
}

function splitIntoMessages(batch) {
  return batch.match(/UNH\+.*?UNT\+[^\']*\'+?/g);
}

function splitIntoSegments(message) {
  message = message.replace(/(\?)'/g, '#MARK#').replace(/'/g, '#SPLIT#').replace(/#MARK#/g, '\'');
  return message.split('#SPLIT#');
}

function splitIntoDataElements(message) {
  // FIXME: Check if this removing of single quotes is necessary
  return message.replace(/\'/g, '').split('+');
}

////////////////////////
// Advanced Functions //
////////////////////////

function splitListAndRestOfMessage(message) {
  var listRegEx = /(GID\+.*?\')(?=GID\+.*?\'|UNT\+.*?\')/g;
  var list = message.match(listRegEx);
  var restOfMessage = message.replace(listRegEx, '');
  return {
    message: restOfMessage,
    list: list,
  };
}

function parseMessageSegment(segment) {
  var dataElements = splitIntoDataElements(segment);
  if (_.has(_c, dataElements[0])) {

    // get encoding
    var dataElementEncoding = _c[dataElements[0]].elements;
    var nesting = _.has(_c[dataElements[0]], 'nesting') ? _c[dataElements[0]].nesting : null;

    // prepare return
    var parsedMessageSegment = clone(_c[dataElements[0]]);
    delete parsedMessageSegment.elements;
    delete parsedMessageSegment.nesting;

    // parse data elements
    var parsedDataElements = parseDataElements(dataElements, dataElementEncoding);

    // nest data elements if there's an additional identifier
    if (nesting) {

      // determine where to look for the nesting identifier, e.g. RFF+IV:123 or NAD+OS+123
      var nestIdentifierLocation = nesting.nest.indexOf(':') > -1 ?
        nesting.nest.split(':') : [nesting.nest, null];

      var nest = parsedDataElements[nestIdentifierLocation[0]];
      var nestValue = _.isNull(nestIdentifierLocation[1]) ?
        nest.value : nest.value.split(':')[nestIdentifierLocation[1]];
      var nestName = _.has(nesting, nestValue) ? nesting[nestValue] : nestValue;

      parsedMessageSegment[nestValue] = {
        name: nestName,
        raw: segment,
      };

      parsedMessageSegment[nestValue] =
        _.extend(parsedMessageSegment[nestValue], parsedDataElements);

    } else {

      parsedMessageSegment.raw = segment;
      parsedMessageSegment = _.extend(parsedMessageSegment, parsedDataElements);

    }

    return {
      code: dataElements[0],
      message: parsedMessageSegment,
    };
  } else return null;
}

function parseDataElements(dataElements, dataElementEncoding) {
  var parsedDataElements = {};

  for (var i = 1; i < dataElements.length; i++) {
    var dataElementId = '0' + i + '0';
    var dataElement = {};

    if (_.has(dataElementEncoding, dataElementId)) {
      if (_.has(dataElementEncoding[dataElementId], 'name'))
        dataElement.name = dataElementEncoding[dataElementId].name;
      else
        dataElement.name = dataElementEncoding[dataElementId];
    }

    var dataElementValue = dataElements[i];
    dataElement.value = dataElementValue;

    if (dataElementValue.indexOf(':') > -1) {

      var dataElementComponents = dataElementValue.split(':');
      var decEnc = _.has(dataElementEncoding, 'dataElementId') &&
        _.has(dataElementEncoding[dataElementId], 'elements') ?
        dataElementEncoding[dataElementId].elements : null;
      var parsedDataElementComponents = parseDataElementComponents(dataElementComponents, decEnc);

      dataElement = _.extend(dataElement, parsedDataElementComponents);

    }

    parsedDataElements[dataElementId] = dataElement;
  }

  return parsedDataElements;
}

function parseDataElementComponents(dataElementComponents, dataElementComponentEncoding) {
  var parsedDataElementComponents = {};

  for (var i = 0; i < dataElementComponents.length; i++) {
    var dataElementComponentId = '' + i;
    var dataElementComponent = {};

    if (_.has(dataElementComponentEncoding, dataElementComponentId))
      dataElementComponent.name = dataElementComponentEncoding[dataElementComponentId];
    dataElementComponent.value = dataElementComponents[i];

    parsedDataElementComponents[dataElementComponentId] = dataElementComponent;
  }

  return parsedDataElementComponents;
}

function inspectNode(name, node, indent) {

  var title = name;
  if (isValid(node.name)) title += ': ' + node.name;
  if (isValid(node.raw)) title += ' (raw: ' + node.raw + ')';
  if (isValid(node.value)) title += ' # ' + node.value;
  printWithIndent(indent, title);

  var subNodes = _.keys(node);
  for (var i = 0; i < subNodes.length; i++) {
    if (subNodes[i] !== 'name' && subNodes[i] !== 'raw' && subNodes[i] !== 'value') {
      inspectNode(subNodes[i], node[subNodes[i]], indent + 1);
    }
  }

}

function mergeComponents(parsed, resultMessage) {
  var message = parsed.message;
  var notAMergeKeys = ['name', 'raw', 'value', 'message'];
  var result = null;
  _.keys(message).forEach(function (key) {
    if (notAMergeKeys.indexOf(key) !== -1) return;

    var idCode = _.keys(resultMessage).filter(function (resultKey) {
      return resultKey === key;
    })[0];

    if (!idCode) result = parsed.message;
    else {
      _.keys(message[key]).forEach(function (firstLevelKey) {
        if (notAMergeKeys.indexOf(firstLevelKey) !== -1) return;
        else {
          _.keys(message[key][firstLevelKey]).forEach(function (secondLevelKey) {

            if (notAMergeKeys.indexOf(secondLevelKey) !== -1) return;
            else {
              var path = [key, firstLevelKey, secondLevelKey].join('.');

              console.log(JSON.stringify(resultMessage, ' ', 2));
              console.log(JSON.stringify(path, ' ', 2));

              var sel = select(resultMessage, path);
              var oldValue = sel && _.has(sel, 'value') ? sel.value : null;
              if (oldValue) {
                var newValue = select(message, path).value;

                if (Array.isArray(oldValue)) oldValue.push(newValue);
                else if (oldValue !== newValue) oldValue = [oldValue, newValue];

                insert(resultMessage, path + '.value', oldValue);
              }
            }
          });
        }
      });
      result = resultMessage;
    }
  });
  return result;
}

//////////////
// External //
//////////////

function parseEdi(edi) {
  if (!_.isString(edi)) return null;
  else edi = edi.replace(/(\n|\r|\r\n)/gi, '');

  var result = [];

  var interchanges = splitIntoInterchanges(edi);
  for (var i = 0; i < interchanges.length; i++) {

    var messages = splitIntoMessages(interchanges[i]);
    for (var j = 0; j < messages.length; j++) {
      var _this = splitListAndRestOfMessage(messages[j]);
      var resultMessage = {
        unknown: [],
      };

      // read the 'rest of the message', i.e. everything but the list
      var messageSegments = splitIntoSegments(_this.message);
      for (var k = 0; k < messageSegments.length; k++) {

        var parsed = parseMessageSegment(messageSegments[k]);
        if (!_.isNull(parsed)) {
          if (_.has(resultMessage, parsed.code)) {
            // merge components when there's more than one with the same segment, i.e. RFF:CW twice.
            var mergedResult = mergeComponents(parsed, resultMessage[parsed.code]);
            _.extend(resultMessage[parsed.code], mergedResult);
          } else resultMessage[parsed.code] = parsed.message;
        } else resultMessage.unknown.push(messageSegments[k]);

      }

      // read the list
      var listItems = [];
      if (!_.isNull(_this.list)) {
        for (var l = 0; l < _this.list.length; l++) {
          var listMessageSegments = splitIntoSegments(_this.list[l]);
          var parsedListElement = {};

          for (var m = 0; m < listMessageSegments.length; m++) {
            var parsed2 = parseMessageSegment(listMessageSegments[m]);
            if (!_.isNull(parsed2)) parsedListElement[parsed2.code] = parsed2.message;
            else resultMessage.unknown.push(listMessageSegments[m]);
          }

          listItems.push(parsedListElement);
        }
      }

      // multiply the rest of the message with the list to break down into single complete records
      if (!_.isNull(_this.list)) {
        for (var n = 0; n < listItems.length; n++) {
          result.push(_.extend(clone(resultMessage), listItems[n]));
        }
      } else result.push(resultMessage);

    }

  }

  return result;

}

function inspectEdi(edi) {
  var json = parseEdi(edi);

  for (var i = 0; i < json.length; i++) {
    var segments = _.keys(json[i]);

    for (var j = 0; j < segments.length; j++) {
      if (segments[j] !== 'unknown') {
        inspectNode(segments[j], json[i][segments[j]], 1);
      }
    }

    printWithIndent(1, 'Missing matchings');
    for (var k = 0; k < json[i].unknown.length; k++) {
      printWithIndent(2, json[i].unknown[k]);
    }

  }
}

module.exports = {
  parseEdi: parseEdi,
  inspectEdi: inspectEdi,
  selectWithPath: select,
};
