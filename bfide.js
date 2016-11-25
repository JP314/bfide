
var STATES = { EDIT_MODE : 0, RUNNING : 1, DEBUGGING : 2, PAUSED : 3, TERMINATED : 4 };

var ideState = new (function() {
	var me = this;
	
	this.state = STATES.EDIT_MODE;
	this.__lastState = STATES.EDIT_MODE;
	this.debugSource = undefined;
	this.debugPointer = undefined;
	this.memoryView = {
		columns : 16,
		showIndex : true,
		showHex : true,
		showDec : true,
		showAscii : true,
		nonPrintableChar : '.',
		data : [],
		ptr:0
	};
	this.io = new Terminal("#io-terminal");
	
	function setBoolClass(selector, name, boolValue) {
		item = $(selector);
		item.removeClass(boolValue ? name + "-no"  : name + "-yes");
		item.addClass   (boolValue ? name + "-yes" : name + "-no");
	}
	
	function toggleClass(selector, name) {
		item = $(selector);
		if (item.hasClass(name)) {
			item.removeClass(name);
		} else {
			item.addClass(name);
		}
	}
	
	function lpad(str, padString, length) {
		str = str + "";
		while (str.length < length)
			str = padString + str;
		return str;
	}
	
	function getCellSize() {
		var cellSize = $('input[name=cellsize]:checked').prop("id");
		return (cellSize && parseInt(cellSize.substr(cellSize.length - 2))) || 8;
	}
	
	function getMemorySize() {
		return parseInt($('#num-set-cachesize').val()) || 512;
	}
	
	function getCacheMode() {
		var cacheMode = $('input[name=cachepointer]:checked').prop("id");
		return cacheMode === "rdb-set-undefinedcache" ? CACHE_MODE.UNDEFINED :
			   cacheMode === "rdb-set-wrapcache" ? CACHE_MODE.WRAP :
			   cacheMode === "rdb-set-errorcache" ? CACHE_MODE.ERROR :
			   cacheMode === "rdb-set-infinitecache" ? CACHE_MODE.INFINITE :
			   null;
	}
	
	function isDebugMode() {
		return !!me.debugSource;
	}
	
	function scrollTo(container, target) {
		container = $(container);
		target = $(target);
		if (container.length > 0 && target.length > 0) {
			container.animate({
				scrollTop: target.offset().top - container.offset().top + container.scrollTop()
			}, 100);
		}
	}
	
	this.load = function() {
		this.applyUIChanges(STATES.EDIT_MODE);
		
		$("#btn-run").click(function() { 
			me.applyUIChanges(STATES.RUNNING);
			me.startProgram();
		});
		$("#btn-debug").click(function() {
			me.applyUIChanges(STATES.DEBUGGING);
			me.startProgram();
		});
		$("#btn-restart").click(function() {
			me.applyUIChanges(isDebugMode() ? STATES.DEBUGGING : STATES.RUNNING);
			me.startProgram();
		});
		$("#btn-stop").click(function() { me.applyUIChanges(STATES.EDIT_MODE); });
		$("#btn-edit").click(function() { me.applyUIChanges(STATES.EDIT_MODE); });
		$("#btn-dbg-single").click(function() { me.debugStep(DEBUG_MODE.SINGLE_STEP); });
		$("#btn-dbg-continue").click(function() { me.debugStep(DEBUG_MODE.CONTINUE); });
		$("#btn-dbg-skip").click(function() { me.debugStep(DEBUG_MODE.SKIP_BREAKPOINTS); });
		$("#btn-dbg-continueLoop").click(function() { me.debugStep(DEBUG_MODE.CONTINUE_LOOP); });
		$("#btn-dbg-breakLoop").click(function() { me.debugStep(DEBUG_MODE.BREAK_LOOP); });
		$("#btn-view-js").click(function() { alert(me.bf.generatedJS); });
		
		this.memoryView.showIndex = $("#ckb-mem-colindex").prop("checked");
		this.memoryView.showHex   = $("#ckb-mem-hex").prop("checked");
		this.memoryView.showDec   = $("#ckb-mem-dec").prop("checked");
		this.memoryView.showAscii = $("#ckb-mem-ascii").prop("checked");
		this.memoryView.columns   = Number($("#num-mem-colsize").val()) || 16;
		
		function bindMemCkb(ckb, set) {
			$(ckb).click(function() {
				set($(this).is(":checked"));
				me.updateMemoryView();
			});
		}
		
		bindMemCkb("#ckb-mem-colindex", function(v) me.memoryView.showIndex = v);
		bindMemCkb("#ckb-mem-hex",      function(v) me.memoryView.showHex = v);
		bindMemCkb("#ckb-mem-dec",      function(v) me.memoryView.showDec = v);
		bindMemCkb("#ckb-mem-ascii",    function(v) me.memoryView.showAscii = v);
		$("#num-mem-colsize").change(function() {
			me.memoryView.columns = Number($("#num-mem-colsize").val()) || 16;
			me.updateMemoryView();
		});
		
		function expandx(val) {
			setBoolClass("body", "expanded-x", val);
			$("#panel-main, #panel-output").animate({
				width: val ? "100%" : "50%"
			}, {
				complete:function() {
					$(this)
						.removeClass("col-sm-6")
						.removeClass("col-sm-12")
						.css("width", "")
						.addClass(val ? "col-sm-12" : "col-sm-6");
				}
			});
		}
		
		$(".expandx").click(function() expandx(true));
		$(".collapse-x").click(function() expandx(false));
		
		function expandy(src, val) {
			var expand = $(src).parent();
			setBoolClass(expand, "expanded-y", val);
			var targets = expand.attr("targety").trim().split(/\s+/g).map(function(s) "#"+s).join(", ");
			$(targets).css("height", val ? "25em" : "5em");
		}
		
		$(".expandy").click(function() expandy(this, true));
		$(".collapse-y").click(function() expandy(this, false));
		
	};
	
	this.applyUIChanges = function(state) {
		
		this.state = state;
		setBoolClass("body", "running",    this.state !== STATES.EDIT_MODE);
		setBoolClass("body", "debugging",  this.state === STATES.PAUSED);
		setBoolClass("body", "terminated", this.state === STATES.TERMINATED);
		
		if (this.__lastState === STATES.EDIT_MODE || this.__lastState == STATES.TERMINATED || this.state === STATES.EDIT_MODE) {
			this.io.clear();
			this.memoryView.ptr = 0;
			this.memoryView.data = new Array(getMemorySize());
			this.updateMemoryView();
		}
		
		if (this.__lastState === STATES.EDIT_MODE && this.state !== STATES.EDIT_MODE) {
			var sourceView = $("#source-view");
			var sourceEdit = $("#source-edit");
			
			this.bfsource = sourceEdit.val();
			this.bf = new bf(this.bfsource);
			sourceView.html(this.bf.toHTML());
			
			if (this.state === STATES.DEBUGGING) {			
				$("insn").click(function(e) {
					var insnClass = [].filter.call(this.classList, (function(c) c.startsWith("insn-")))[0];
					toggleClass("." + insnClass, "syntax-breakpoint");
				});
			}
		}
		
		if (this.state === STATES.TERMINATED) {
			this.debugSource = null;
		}
		
		this.__lastState = this.state;
	};

	this.startProgram = function() {
		
		var debug = this.state === STATES.DEBUGGING;
		var result = null;

		try {
			result = this.bf.toJS(debug, getMemorySize(), getCellSize(), getCacheMode(), true)({ 
				"read":  function(fn) {
					me.io.readChar(function(str) {
						fn(str.charCodeAt(0));
					});
				},
				"print": function(i) me.io.write(String.fromCharCode(i)),
				"dump":	 function(iptr,vptr,data) {				
					me.memoryView.data = data;
					me.memoryView.ptr = vptr;
					me.updateMemoryView();
				},
				"error" : function(msg) {
					alert(msg);
				}
			});
		}
		catch(e) {
			if (e.length === 3) {
				alert(e[0]); // show msg
				e[1](e[2]); // dump
			}
		}
		if (debug) {
			this.debugSource = result;
			this.applyUIChanges(STATES.PAUSED);
			this.setDebugInsnPointer(0);
			this.updateMemoryView();
		} else {
			this.applyUIChanges(STATES.TERMINATED);
		}
	};
	
	this.debugStep = function(mode) {
		
		$(".debug-pointer").removeClass("debug-pointer");
		var oldPointer = this.debugPointer;
		
		var id = this.bf.debugStep(
			this.debugSource,
			mode,
			function(id) $(".insn-"+(id+1)).hasClass("syntax-breakpoint"),
			function(fn) {
				me.applyUIChanges(STATES.RUNNING);
				me.io.readChar(function(str) {
					me.applyUIChanges(STATES.PAUSED);
					me.setDebugInsnPointer(oldPointer+1);
					fn(str.charCodeAt(0));
				});
			}
		);
				
		if (id === -1) {
			this.applyUIChanges(STATES.TERMINATED);
			this.setDebugInsnPointer(-1);
		} else if(id !== undefined) {
			this.setDebugInsnPointer(id+1);
		} 
		else {
			// restore old pointers
			this.setDebugInsnPointer(oldPointer);
		}
	};
	
	this.setDebugInsnPointer = function(id) {
		$(".debug-pointer").removeClass("debug-pointer");
		
		var debugPointer = $(id === -1 ? ".insn-eof" : ".insn-"+id);
		debugPointer.addClass("debug-pointer");
		
		scrollTo("#source-view", debugPointer);
		
		this.debugPointer = id;
	};
	
	this.updateMemoryView = function() {
		
		function mod(a,m) (a % m + m) % m;
		
		var ptr = this.memoryView.ptr;
		var data = this.memoryView.data;
		var colSize = this.memoryView.columns;
		var min = 0, max = data.length; // works also wiht negative min
		var start = min - mod(min, colSize), stop = max + mod(colSize - max, colSize);
		var result = "<table class='codebox'>";
		var i;
		
		function log(a, base) Math.log(a) / Math.log(base);
		
		var maxValue = Math.pow(2, getCellSize()) - 1; 
		var hexLen = Math.ceil(log(maxValue, 16));
		var decLen = Math.ceil(log(maxValue, 10));
		
		function addNumericTableLine(base, len) {
			result += "<td>";
			for(var j = i; j < i+colSize; j++) {
				if (j !== i) result += "&nbsp;";
				var cell;
				if (j < min || j >= max) {
					cell = "";
					for(var n = 0; n < len; n++) cell += "&nbsp";
				} else {
					cell = data[j] === undefined ? 0 : data[j];
					cell = lpad(cell.toString(base), "0", len);
				}
				if (j === ptr) cell = "<mem-ptr>" + cell + "</mem-ptr>";
				result += cell;
			}
			result += "</td>";
		}

		for(i = start; i < stop; i+=colSize) {
			result += "<tr>";
			if (this.memoryView.showIndex) {
				result += "<td class='mem-tbl-index'>" + i + "</td>";
			}
			if (this.memoryView.showHex) {
				addNumericTableLine(16, hexLen);
			}
			if (this.memoryView.showDec) {
				addNumericTableLine(10, decLen);
			}
			if (this.memoryView.showAscii) {
				result += "<td>";
				for(var j = i; j < i+colSize; j++) {
					var cell = 
						j < min || j >= max ? "&nbsp;" : 
						data[j] === undefined || data[j] < 32 ? this.memoryView.nonPrintableChar : 
						String.fromCharCode(data[j]);
					if (j === ptr) cell = "<mem-ptr>" + cell + "</mem-ptr>";
					result += cell;
				}
				result += "</td>";
			}
			
			result += "</tr>";
		}
		$("#memory").html(result);
		$("#memory-pointer").text(ptr);
	};
})();

ideState.load();