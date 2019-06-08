'use strict';

import {
  isset, tobool, tonum, tostr, isarray, objForEach,
  objMap, isrect, getStyle, stdDoms
} from './stdlib';
import EventHandler from './event-handler';
import { stdRect, diffRect } from './rect';
import ALIGNMENT_PROPS from './alignment-props';

const ALIGNMENT_OUTER = [ALIGNMENT_PROPS.tb, ALIGNMENT_PROPS.rl, ALIGNMENT_PROPS.bt, ALIGNMENT_PROPS.lr];
const ALIGNMENT_INNER = [ALIGNMENT_PROPS.tt, ALIGNMENT_PROPS.rr, ALIGNMENT_PROPS.bb, ALIGNMENT_PROPS.ll];
const ALIGNMENT_CENTER = [ALIGNMENT_PROPS.xx, ALIGNMENT_PROPS.yy];
const EVENT = {
  append: 'magnet',
  attract: 'attract',
  unattract: 'unattract',
  attracted: 'attracted',
  unattracted: 'unattracted',
  magnetStart: ['magnetenter', 'magnetstart'],
  magnetChange: 'magnetchange',
  magnetEnd: ['magnetend', 'magnetleave'],
  mouseDown: ['mousedown', 'touchstart'],
  mouseMove: ['mousemove', 'touchmove'],
  mouseUp: ['mouseup', 'mouseleave', 'touchend'],
  keyDown: 'keydown',
  keyUp: 'keyup',
};


const getEventXY = ({ clientX, clientY, touches: [{ clientX: x = clientX, clientY: y = clientY } = {}] = []}) => ({ x, y });
const bindEventNames = (self, ...names) => {
  const { [MAGNET_PROPS.id]: id } = self;
  return names.reduce((arr, name) => (isarray(name)
    ?arr.concat(bindEventNames(self, ...name))
    :arr.concat(name.split(' ').map((name) => `${name}.${id}`))
  ), []);
};
const getParent = (d) => {
  for (let r=d.parentElement; r; r=r.parentElement) {
    if ('static' !== getStyle(r).position) {
      return r;
    }
  }
  return document;
};


// ===================================================================
//  Magnet start

const MAGNET_PROPS = {
  id: '_id',
  targets: '_targets',
  eventHandler: '_eventHandler',
  distance: '_distance',
  attractable: '_attractable',
  stayInParent: '_stayInParent',
  alignOuter: '_alignOuter',
  alignInner: '_alignInner',
  alignCenter: '_alignCenter',
  alignParentCenter: '_alignParentCenter',
};

function Magnet(...doms) {
  if (!this instanceof Magnet) {
    return new Magnet(...arguments);
  }
  Object.defineProperties(this, {
    [MAGNET_PROPS.id]: { value: `magnet_${Date.now()}` },
    [MAGNET_PROPS.targets]: { value: [], writable: true },
    [MAGNET_PROPS.eventHandler]: { value: new EventHandler(this) },
    [MAGNET_PROPS.distance]: { value: 0, writable: true },
    [MAGNET_PROPS.attractable]: { value: true, writable: true },
    [MAGNET_PROPS.stayInParent]: { value: false, writable: true },
    [MAGNET_PROPS.alignOuter]: { value: true, writable: true },
    [MAGNET_PROPS.alignInner]: { value: true, writable: true },
    [MAGNET_PROPS.alignCenter]: { value: true, writable: true },
    [MAGNET_PROPS.alignParentCenter]: { value: false, writable: true },
  });
  if (doms.length) {
    this.add(doms);
  }
}

// distance
Magnet.prototype.getDistance = function() {
  return this[MAGNET_PROPS.distance];
};
Magnet.prototype.setDistance = function(distance) {
  if (isNaN(distance)) {
    throw new Error(`Invalid distance: ${tostr(distance)}`);
  } else if (distance < 0) {
    throw new Error(`Illegal distance: ${distance}`);
  }
  this[MAGNET_PROPS.distance] = tonum(distance);
  return this;
};
Magnet.prototype.distance = function(distance) {
  return (isset(distance) ?this.setDistance(distance) :this.getDistance());
};

// attract
Magnet.prototype.getAttractable = function() {
  return this[MAGNET_PROPS.attractable];
};
Magnet.prototype.setAttractable = function(enabled) {
  this[MAGNET_PROPS.attractable] = tobool(enabled);
  return this;
};
Magnet.prototype.attractable = function(enabled) {
  return (isset(enabled) ?this.setAttractable(enabled) :this.getAttractable());
};

// stay in parent
Magnet.prototype.getStayInParent = function() {
  return this[MAGNET_PROPS.stayInParent];
};
Magnet.prototype.setStayInParent = function(enabled) {
  this[MAGNET_PROPS.stayInParent] = tobool(enabled);
  return this;
};
Magnet.prototype.stayInParentEdge = 
Magnet.prototype.stayInParentElem = function(enabled) {
  return (isset(enabled) ?this.setStayInParent(enabled) :this.getStayInParent());
};


// align
['Outer', 'Inner', 'Center', 'ParentCenter'].forEach((name) => {
  const propName = `align${name}`;
  const funcName = `Align${name}`;
  Magnet.prototype[`get${funcName}`] = function() {
    return this[MAGNET_PROPS[propName]];
  };
  Magnet.prototype[`set${funcName}`] = function(enabled) {
    this[MAGNET_PROPS[propName]] = tobool(enabled);
    return this;
  };
  Magnet.prototype[`enabled${funcName}`] = function(enabled) {
    return (isset(enabled) ?this[`set${funcName}`](enabled) :this[`get${funcName}`]());
  };
});


// on/off
['on', 'off'].forEach((prop) => {
  Magnet.prototype[prop] = function(...args) {
    this[MAGNET_PROPS.eventHandler][prop](...args);
    return this;
  };
});


// check
Magnet.prototype.check = function(
  refDom,
  refRect = stdRect(refDom),
  alignmentProps = [].concat(
    (this.getAlignOuter() ?ALIGNMENT_OUTER :[]),
    (this.getAlignInner() ?ALIGNMENT_INNER :[]),
    (this.getAlignCenter() ?ALIGNMENT_CENTER :[]),
  )
) {
  const parentDom = getParent(refDom);
  const parentRect = stdRect(parentDom);
  const targets = this[MAGNET_PROPS.targets]
    .filter((dom) => (dom!==refDom))
    .map((dom) => diffRect(refRect, dom, { alignments: alignmentProps, }));
  const results = targets.reduce((results, diff) => {
    objForEach(diff.results, (_, prop) => {
      results[prop] = (results[prop]||[]);
      results[prop].push(diff);
    });
    return results;
  }, {});
  const rankings = objMap(results, (arr, prop) => arr.concat().sort((a, b) => (a.results[prop]-b.results[prop])));
  return {
    source: { rect: refRect, element: refDom },
    parent: { rect: parentRect, element: parentDom },
    targets,
    results,
    rankings,
    mins: objMap(rankings, (arr) => arr[0]),
    maxs: objMap(rankings, (arr) => arr[arr.length-1]),
  };
};


// add
Magnet.prototype.add = function(...doms) {
  doms = stdDoms(...doms);
  
  // reject special elements
  [window, document, document.body].forEach((elm) => {
    if (doms.includes(elm)) {
      throw new Error(`Illegal element: ${tostr(src)}`);
    }
  });

  doms.forEach((dom) => {
    if (this[MAGNET_PROPS.targets].includes(dom)) {
      return;
    }
    EventHandler.on(dom, bindEventNames(this, EVENT.mouseDown), (evt) => {
      evt.preventDefault();

      let _toAttract = !evt.ctrlKey;
      let _lastEvent = evt;
      let _lastAttractedX = null;
      let _lastAttractedY = null;

      const { left: oriLeft, top: oriTop } = stdRect(dom);
      const { x: oriX, y: oriY } = getEventXY(evt);
      const pushDomToEvent = (arr, dom) => (!arr.includes(dom)&&arr.push(dom));
      const stdMagentEventTarget = (ref) => {
        if (ref) {
          const { prop, target: { rect, element } } = ref;
          const parentRect = stdRect(getParent(element));
          const [position, diff] = (({ top, right, bottom, left }, { top: y, left: x }) => {
            switch (prop) {
              case ALIGNMENT_PROPS.tt:
              case ALIGNMENT_PROPS.bt: return [top, y];
              case ALIGNMENT_PROPS.bb:
              case ALIGNMENT_PROPS.tb: return [bottom, y];
              case ALIGNMENT_PROPS.rr:
              case ALIGNMENT_PROPS.lr: return [right, x];
              case ALIGNMENT_PROPS.ll:
              case ALIGNMENT_PROPS.rl: return [left, x];
              case ALIGNMENT_PROPS.xx: return [((right+left)/2), x];
              case ALIGNMENT_PROPS.yy: return [((top+bottom)/2), y];
            }
          })(rect, parentRect);
          return {
            type: prop,
            rect,
            element,
            position,
            offset: (position-diff),
          };
        } else {
          return null;
        }
      };
      const cmpAttractedResult = (a, b) => {
        if ((a ?true :false) !== (b ?true :false)) {
          return true;
        } else if ((a ?a.target.element :null) !== (b ?b.target.element :null)) {
          return true;
        }
        return false;
      };
      const handleDom = (evt) => {
        const toAttract = (this.getAttractable() ?_toAttract :false);
        const { width, height } = stdRect(dom);
        const { x, y } = getEventXY(evt);
        const diffX = (x-oriX);
        const diffY = (y-oriY);
        const newX = (oriLeft+diffX);
        const newY = (oriTop+diffY);
        const distance = (toAttract ?this.getDistance() :0);
        const newRect = stdRect({
          top: newY,
          right: (newX+width),
          bottom: (newY+height),
          left: newX,
        });
        const { parent, targets } = this.check(dom, newRect, (toAttract ?undefined :[]));
        const { rect: parentRect, element: parentElement } = parent;
        const newPosition = { x: newX, y: newY };
        const { x: attractedX, y: attractedY } = targets
          .concat(
            (this.getStayInParent() ?diffRect(newRect, parentElement, { alignments: ALIGNMENT_INNER, absDistance: false }) :[]),
            (this.getAlignParentCenter() ?diffRect(newRect, parentElement, { alignments: ALIGNMENT_CENTER }) :[]),
          )
          .reduce(({ x, y }, diff) => {
            const { target, results, ranking } = diff;
            return ranking.reduce(({ x, y }, prop) => {
              let value = results[prop];
              if (value <= distance) {
                switch (prop) {
                  case ALIGNMENT_PROPS.rr:
                  case ALIGNMENT_PROPS.ll:
                  case ALIGNMENT_PROPS.rl:
                  case ALIGNMENT_PROPS.lr:
                  case ALIGNMENT_PROPS.xx:
                  if (!x || value < x.value) {
                    x = { prop, value, target };
                  }
                  break;

                  case ALIGNMENT_PROPS.tt:
                  case ALIGNMENT_PROPS.bb:
                  case ALIGNMENT_PROPS.tb:
                  case ALIGNMENT_PROPS.bt:
                  case ALIGNMENT_PROPS.yy:
                  if (!y || value < y.value) {
                    y = { prop, value, target };
                  }
                  break;
                }
              }
              return { x, y };
            }, { x, y });
          }, { x: null, y: null });

        // be attracted by nearest target
        const eventsAttracted = [];
        const eventsUnattracted = [];
        if (attractedX) {
          const { prop, target: { rect } } = attractedX;
          switch (prop) {
            case ALIGNMENT_PROPS.rr: newPosition.x = (rect.right-width); break;
            case ALIGNMENT_PROPS.ll: newPosition.x = rect.left; break;
            case ALIGNMENT_PROPS.rl: newPosition.x = (rect.left-width); break;
            case ALIGNMENT_PROPS.lr: newPosition.x = rect.right; break;
            case ALIGNMENT_PROPS.xx: newPosition.x = ((rect.left+rect.right-width)/2); break;
          }
        }
        if (attractedY) {
          const { prop, target: { rect } } = attractedY;
          switch (prop) {
            case ALIGNMENT_PROPS.tt: newPosition.y = rect.top; break;
            case ALIGNMENT_PROPS.bb: newPosition.y = (rect.bottom-height); break;
            case ALIGNMENT_PROPS.tb: newPosition.y = rect.bottom; break;
            case ALIGNMENT_PROPS.bt: newPosition.y = (rect.top-height); break;
            case ALIGNMENT_PROPS.yy: newPosition.y = ((rect.top+rect.bottom-height)/2); break;
          }
        }

        // trigger events
        const diffAttractedX = cmpAttractedResult(_lastAttractedX, attractedX);
        const diffAttractedY = cmpAttractedResult(_lastAttractedY, attractedY);
        if (diffAttractedX) {
          (attractedX&&pushDomToEvent(eventsAttracted, attractedX.target.element));
          (_lastAttractedX&&pushDomToEvent(eventsUnattracted, _lastAttractedX.target.element));
        }
        if (diffAttractedY) {
          (attractedY&&pushDomToEvent(eventsAttracted, attractedY.target.element));
          (_lastAttractedY&&pushDomToEvent(eventsUnattracted, _lastAttractedY.target.element));
        }
        eventsAttracted.forEach((element) => EventHandler.trigger(element, EVENT.attracted, dom));
        eventsUnattracted.forEach((element) => EventHandler.trigger(element, EVENT.unattracted, dom));
        
        const currentAttract = (attractedX||attractedY ?true :false);
        const lastAttract = (_lastAttractedX||_lastAttractedY ?true :false);
        const eventHandler = this[MAGNET_PROPS.eventHandler];

        if (currentAttract) {
          const dataX = stdMagentEventTarget(attractedX);
          const dataY = stdMagentEventTarget(attractedY);
          const anyDiff = (diffAttractedX||diffAttractedY);
          if (!lastAttract) {
            // magnet start: start of any attract event
            eventHandler.trigger(EVENT.magnetChange, { source: dom, x: dataX, y: dataY });
            eventHandler.trigger(EVENT.magnetStart, { source: dom, x: dataX, y: dataY });
            EventHandler.trigger(dom, EVENT.attract, { x: dataX, y: dataY });
          } else if (anyDiff ||
            (!diffAttractedX && attractedX && _lastAttractedX && attractedX.prop !== _lastAttractedX.prop) ||
            (!diffAttractedY && attractedY && _lastAttractedY && attractedY.prop !== _lastAttractedY.prop)
          ) {
            // magnet change: change of any attract event
            eventHandler.trigger(EVENT.magnetChange, { source: dom, x: dataX, y: dataY });
            EventHandler.trigger(dom, EVENT.attract, { x: dataX, y: dataY });
          } else if (anyDiff) {
            eventHandler.trigger(EVENT.magnetChange, { source: dom, x: dataX, y: dataY });
          }
          if (anyDiff) {
            EventHandler.trigger(dom, EVENT.unattract, {
              x: stdMagentEventTarget(_lastAttractedX),
              y: stdMagentEventTarget(_lastAttractedY),
            });
          }
        } else if (lastAttract) {
          // magnet end: end of all attract event
          const dataX = stdMagentEventTarget(_lastAttractedX);
          const dataY = stdMagentEventTarget(_lastAttractedY);
          eventHandler.trigger(EVENT.magnetChange, { source: dom, x: null, y: null });
          eventHandler.trigger(EVENT.magnetEnd, { source: dom, x: dataX, y: dataY });
          EventHandler.trigger(dom, EVENT.unattract, { x: dataX, y: dataY });
        }

        // move dom
        dom.style.top = `${newPosition.y-parentRect.top}px`;
        dom.style.left = `${newPosition.x-parentRect.left}px`;
        _lastEvent = evt;
        _lastAttractedX = attractedX;
        _lastAttractedY = attractedY;
      };

      EventHandler.off(document.body, bindEventNames(this, EVENT.mouseMove, EVENT.mouseUp, EVENT.keyDown, EVENT.keyUp));
      EventHandler.on(document.body, bindEventNames(this, EVENT.keyDown, EVENT.keyUp), (evt) => {
        const toAttract = !evt.ctrlKey;
        if (toAttract !== _toAttract) {
          _toAttract = toAttract;
          handleDom(_lastEvent);
        }
      });
      EventHandler.on(document.body, bindEventNames(this, EVENT.mouseUp), () => {
        const eventsUnattracted = [];
        EventHandler.off(document.body, bindEventNames(this, EVENT.mouseMove, EVENT.mouseUp, EVENT.keyDown, EVENT.keyUp));
        (_lastAttractedX&&pushDomToEvent(eventsUnattracted, _lastAttractedX.target.element));
        (_lastAttractedY&&pushDomToEvent(eventsUnattracted, _lastAttractedY.target.element));
        eventsUnattracted.forEach((element) => EventHandler.trigger(element, EVENT.unattracted, dom));
        if (_lastAttractedX || _lastAttractedY) {
          EventHandler.trigger(dom, EVENT.unattract);
          this[MAGNET_PROPS.eventHandler].trigger(EVENT.magnetEnd, { source: dom });
        }
      });
      EventHandler.on(document.body, bindEventNames(this, EVENT.mouseMove), (evt) => handleDom(evt));
    });
    dom.style.position = 'absolute';
    dom.style.top = dom.offsetTop;
    dom.style.left = dom.offsetLeft;
    this[MAGNET_PROPS.targets].push(dom);
  });
  return this;
};


// remove
const removeMembers = (self, refDoms, ...doms) => stdDoms(...doms).reduce((arr, dom) => {
  const index = refDoms.indexOf(dom);
  if (-1 !== index) {
    refDoms.splice(index, 1);
    EventHandler.off(dom, bindEventNames(self, EVENT.mouseDown));
    arr.push(dom);
  }
  return arr;
}, []);
Magnet.prototype.remove = function(...doms) {
  removeMembers(this, this[MAGNET_PROPS.targets], ...doms);
  return this;
};
Magnet.prototype.removeFull = function(...doms) {
  removeMembers(this, this[MAGNET_PROPS.targets], ...doms).forEach((dom) => {
    dom.style.position = '';
    dom.style.top = '';
    dom.style.left = '';
  });
  return this;
};


// clear
const clearMembers = (self, refDoms) => refDoms.splice(0, refDoms.length).map((dom) => {
  EventHandler.off(dom, bindEventNames(self, EVENT.mouseDown));
  return dom;
});
Magnet.prototype.clear = function() {
  clearMembers(this, this[MAGNET_PROPS.targets]);
  return this;
};
Magnet.prototype.clearFull = function() {
  clearMembers(this, this[MAGNET_PROPS.targets]).forEach((dom) => {
    dom.style.position = '';
    dom.style.top = '';
    dom.style.left = '';
  });
  return this;
};


Magnet.isRect = (rect) => isrect(rect);
Magnet.stdRect = (rect) => stdRect(rect);
Magnet.measure = 
Magnet.diffRect = (source, target, ...args) => diffRect(source, target, ...args);

export default Magnet;