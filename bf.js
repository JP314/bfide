
var INSTRUCTIONS = {
	MOVE_PTR:0,
	CHANGE_VALUE:1,
	BEGIN_LOOP:2,
	END_LOOP:3,
	PRINT:4,
	READ:5,
	SET_VALUE:6,
	BREAK_POINT:7,
	NOP:8,
};

var DEBUG_MODE = {
	SKIP_BREAKPOINTS:0,
	CONTINUE:1,
	SINGLE_STEP:2,
	CONTINUE_LOOP:3,
	BREAK_LOOP:4
};

var CACHE_MODE = {
	UNDEFINED:0,
	WRAP:1,
	ERROR:2,
	INFINITE:3
}

var bf = function(bfsource) {
	
	function Instruction(type, value) {
		this.type = type;
		this.value = value;
		this.view = null;
		this.id = null;	
	}
	
	function isBfInsn(c) {
		return c === '+' || c === '-' 
			|| c === '<' || c === '>' 
			|| c === '[' || c === ']'
			|| c === '.' || c === ',';
	}
	
	function compileToInstructions() {
		
		var instructionList = [];
		var start = 0, i = 0, len = bfsource.length;
		var insnCounter = 0;
		
		function op(relativeIndex) {
			for(var i = instructionList.length - 1; i >= 0; i--) {
				if (instructionList[i].type !== INSTRUCTIONS.NOP) {
					relativeIndex++;
					if (relativeIndex === 0) {
						return instructionList[i];
					}
				}
			}
		}
		
		function makeComment(relativeIndex) {
			var insn = op(relativeIndex);
			var prev = op(relativeIndex-1);
			insn.id = prev ? prev.id : "";
			insn.type = INSTRUCTIONS.NOP;
			insn.value = false;
			insnCounter--;
		}
		
		function addInstruction(insn) {

			insn.view = bfsource.substring(start, i);
			insn.id = (insn.type === INSTRUCTIONS.NOP && insn.value === true) ? "" : insnCounter;
			instructionList.push(insn);
			start = i;
			
			if (insn.type !== INSTRUCTIONS.NOP) {
				insnCounter++;
			}

			if (insnCounter >= 3 
				&& op(-3).type == INSTRUCTIONS.BEGIN_LOOP 
				&& op(-2).type == INSTRUCTIONS.CHANGE_VALUE && op(-2).value % 2 !== 0
				&& op(-1).type == INSTRUCTIONS.END_LOOP) {
				
				op(-3).type = INSTRUCTIONS.SET_VALUE;
				op(-3).value = 0;
				makeComment(-2);
				makeComment(-1);
			} else if (insnCounter >= 2
				&& op(-2).type === INSTRUCTIONS.SET_VALUE
				&& op(-1).type === INSTRUCTIONS.CHANGE_VALUE) {
				op(-2).value += op(-1).value;
				makeComment(-1);
			}
		}
		
		while (i < len) {
			
			// handle pointer position
			var ptrDelta = 0;
			while(i < len && (bfsource[i] === '<' || bfsource[i] === '>')) {
				ptrDelta += bfsource[i] === '<' ? -1 : +1;
				i++;
			}
			if (ptrDelta !== 0) {
				addInstruction(new Instruction(INSTRUCTIONS.MOVE_PTR, ptrDelta));
			}
			
			// handle value
			var valDelta = 0;
			while(i < len && (bfsource[i] === '-' || bfsource[i] === '+')) {
				valDelta += bfsource[i] === '-' ? -1 : +1;
				i++;
			}
			if (valDelta !== 0) {
				addInstruction(new Instruction(INSTRUCTIONS.CHANGE_VALUE, valDelta));
			}
			
			//handle single instruction
			if (i < len) {
				var insn;
				switch(bfsource[i]) {
					case '[': insn=new Instruction(INSTRUCTIONS.BEGIN_LOOP); break;
					case ']': insn=new Instruction(INSTRUCTIONS.END_LOOP); break;
					case '.': insn=new Instruction(INSTRUCTIONS.PRINT); break;
					case ',': insn=new Instruction(INSTRUCTIONS.READ); break;
					case '+': case '-': case '<': case '>': insn=null; break;
					default: 
						insn=new Instruction(INSTRUCTIONS.NOP,true);
						while (i+1<len && ! isBfInsn(bfsource[i+1])) i++;
						break;
				}
				if (insn) {
					i++;
					addInstruction(insn);
				}
			}
		}
		return instructionList;
	}
	
	this.getIndexOfInsnId = function(id) {
		for(var i = 0, end = this.instructions.length; i < end; i++) {
			if (this.instructions[i].id === id)
				return id;
		}
	}
	
	this.findEnclosingLoop = function(id, backward) {
		var step = backward ? -1 : +1;
		var loopDepth = 0;
		var start = this.getIndexOfInsnId(id);
		if (start !== undefined) {
			for(var i = this.getIndexOfInsnId(id), end = this.instructions.length; 0 <= i && i < end; i+=step) {
				var insn = this.instructions[i];
				if (insn) {
					if (insn.type === INSTRUCTIONS.BEGIN_LOOP) loopDepth+=step;
					if (insn.type === INSTRUCTIONS.END_LOOP)   loopDepth-=step;
				}
				if (loopDepth === -1) return insn.id;
			}
		}
	}
	
	var entityMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;",  '"': '&quot;', "'": '&#39;', "/": '&#x2F;' };
	function escapeHtml(string) {
	  return String(string).replace(/[&<>"'\/]/g, function (s) entityMap[s]);
	}

	this.instructions = compileToInstructions();
	this.bfsource = bfsource;

	this.toHTML = function() {
		var result = "";
		for(var i = 0, len = this.instructions.length; i < len; i++) {
			var insn = this.instructions[i];
			if (insn.type === INSTRUCTIONS.NOP && insn.value === true) {
				result += "<cmt>" + escapeHtml(insn.view) + "</cmt>";
			} else {
				result += "<insn class='insn-"+insn.id+"'>" + insn.view + "</insn>";
			}
		}
		result += "<insn class='insn-eof'>&nbsp;</insn>"
		return result;
	}
	
	this.toJS = function(debug, memSize, cellSize, cacheMode, useReadCallback) {
		
		debug = !!debug;
		memSize = +memSize || 512;
		cellSize = +cellSize || 8;
		cacheMode = cacheMode || CACHE_MODE.UNDEFINED;
		useReadCallback = !!useReadCallback;
		
		var result = (debug || useReadCallback ? "(function*(cb)" : "(function(cb)");
		result += "{'use strict';var ptr=0,data=new Uint" + cellSize + "Array(" + memSize + ")";
		result += ",dump=function(i){cb.dump(i,ptr,data);}";
		
		if (useReadCallback) {
			result += ",ro={result:0}";
		}
		if(cacheMode === CACHE_MODE.INFINITE) {
			result += ",delta=0,data2";
		} else if (cacheMode === CACHE_MODE.ERROR) {
			result += ",function error(i){dump(i);cb.error('Memory Pointer out of range: Pointer = ' + ptr);}";
		}
		
		result+=";/*begin code*/";
		
		var i = 0, len = this.instructions.length;
		while(len > 0 && this.instructions[len-1].type == INSTRUCTIONS.NOP) len--;
		for(var i = 0; i < len; i++) {
			var insn = this.instructions[i];
			if (insn.type === INSTRUCTIONS.MOVE_PTR) {
				result += "ptr+="+insn.value+";";
				
				if (cacheMode === CACHE_MODE.ERROR) {
					if(insn.value < 0) result += "if(ptr<0){error("+insn.id+");return;}";
					if(insn.value > 0) result += "if(ptr>="+memSize+"){error("+insn.id+");return;}";
				} else if (cacheMode === CACHE_MODE.WRAP) {
					if(insn.value < 0) result += "if(ptr<0)ptr=ptr%data.length+data.length;";
					if(insn.value > 0) result += "if(ptr>="+memSize+")ptr=ptr%data.length;";
				} else if(cacheMode === CACHE_MODE.INFINITE) {
					if(insn.value < 0) result += "if(ptr<0){delta=Math.max(64,-ptr*2);data2=new Uint"+cellSize+"Array(data.length+delta);data2.set(data,delta);data=data2;ptr=delta+ptr;}";
					if(insn.value > 0) result += "if(ptr>0){delta=Math.max(64,(data.length-ptr)*2);data2=new Uint"+cellSize+"Array(data.length+delta);data2.set(data);data=data2;}";
				}
				
			} else if (insn.type === INSTRUCTIONS.CHANGE_VALUE) {
				result += "data[ptr]+="+insn.value+";";
			} else if (insn.type === INSTRUCTIONS.BEGIN_LOOP) {
				result += "while(data[ptr]!==0){";
			} else if (insn.type === INSTRUCTIONS.END_LOOP) {
				result += "}";
			} else if (insn.type === INSTRUCTIONS.PRINT) {
				result += "cb.print(data[ptr]);";
			} else if (insn.type === INSTRUCTIONS.READ) {
				if (useReadCallback) {
					// pass data via ro reference
					// state.next(foo) currently doesn't work
					result += "dump("+insn.id+");yield ro;yield 0;data[ptr]=ro.result;";
				} else {
					result += "data[ptr]=cb.read();";
				}
			} else if (insn.type === INSTRUCTIONS.SET_VALUE) {
				result += "data[ptr]="+insn.value+";";
			}
			
			if (insn.type !== INSTRUCTIONS.NOP && insn.type !== INSTRUCTIONS.BREAK_POINT && debug && i!==len-1) {
				result += "yield [dump,"+insn.id+"];";
			}
		}
				
		result += "/*end of code*/dump(" + len + ");";
		result += "})";
		
		this.generatedJS = result;
		
		var func = eval(result);
		if(useReadCallback && !debug) {
			return (function(cb) {
				var iterState = func(cb);
				var first = true;
				var nextStep = function() {
					var state = iterState.next();
					if (state.done === false) {
						cb.read(function(value) {
							state.value.result = +value||0;
							state = iterState.next();
							if (state.value !== 0) {
								throw "invalid internal read state";
							}
							nextStep();
						});
					}
				};
				nextStep();
			});
		}
		else {			
			return func;
		}
	}
	
	this.debugStep = function(jsFuncIter, debugMode, hasBreakpoint, readCallback) {
		
		if (debugMode == null)
			throw "Invalid debug mode: " + debugMode;
		
		var iterState;
		var targetSearched = false;
		var target1 = null, target2 = null;
		var me = this;
		
		function inner() {
			
			while((iterState = jsFuncIter.next()).done === false) {
			
				var yieldState = iterState.value;
				
				if (yieldState.length === undefined) {
					readCallback(function(str) {
						yieldState.result = str;
						if (jsFuncIter.next().value !== 0) {
							throw "invalid internal read state";
						}
						inner();
					});
					break;
				}
				
				var dumpFunc = yieldState[0];
				var id = yieldState[1];

				if (targetSearched === false && (debugMode === DEBUG_MODE.CONTINUE_LOOP || debugMode === DEBUG_MODE.BREAK_LOOP)) {
					targetSearched = true;				
					target1 = me.findEnclosingLoop(id+1, debugMode === DEBUG_MODE.CONTINUE_LOOP);
					target2 = me.findEnclosingLoop(id+1, false);
				}
				
				if ((debugMode === DEBUG_MODE.SINGLE_STEP) ||
					(debugMode !== DEBUG_MODE.SKIP_BREAKPOINTS && hasBreakpoint(id)) ||
					(targetSearched === true && (target1 == id || target2 == id))) {
					dumpFunc(id);
					break;
				}
			}
		}
		
		inner();
		
		if (iterState.done) {
			return -1;
		}
		else if (iterState.value.length === 2) {
			var currentId = iterState.value[1];
			iterState.value[0](currentId); // update memory
			return currentId;
		}
		else {
			return undefined; // no position update
		}
	}
}