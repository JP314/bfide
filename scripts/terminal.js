function Terminal(targetElement) {
	var me = this;
	var targetElement = $(targetElement).first();
	var readCallback = null;
	var readMode = null; // null = not initialized, 0 = not reading, 1 = read char, 2 = read line
	var readBuffer = "";
	var outputBlock = null, outputLine = null, inputLine = null, cursor = null;

	function init() {
		
		var initialText = targetElement.text();
		
		targetElement.html(
			"<div   class='terminal terminal-output terminal-output-block'></div>" +
			"<span  class='terminal terminal-output terminal-output-line'></span>" +
			"<span  class='terminal terminal-cursor'>&nbsp;</span>" +
			"<input class='terminal terminal-input  terminal-input-line' type='text' value=''>");
	
		outputBlock = targetElement.find(".terminal-output-block");
		outputLine = targetElement.find(".terminal-output-line");
		inputLine = targetElement.find(".terminal-input-line");
		cursor = targetElement.find(".terminal-cursor");
		
		setReadMode(0);
		me.write(initialText);
	}
	
	this.writeLine = function(str) this.write(str === undefined ? "" : str + "\n");
	
	this.write = function(str) {	
		
		str += "";
				
		var crIndex = str.lastIndexOf('\r');
		var lfIndex = str.lastIndexOf('\n');
		
		var index =
				crIndex === -1 ? lfIndex :
				lfIndex === -1 ? crIndex :
				crIndex === lfIndex - 1 ? lfIndex :
				Math.max(crIndex, lfIndex);
		
		var outputLineText = outputLine.text();
		
		if (index !== -1) {
			var block = outputLineText + str.substring(0, index+1);
			outputBlock.text(outputBlock.text() + block);
			outputLineText = "";
		}
	
		outputLine.text(outputLineText + str.substring(index+1));
	}
	
	this.readChar = function(callback) {
		setReadMode(1);
		readCallback = callback;
	}
	
	this.readLine = function(callback) {
		setReadMode(2);
		readCallback = callback;
	}
	
	this.clear = function(callback) {
		outputBlock.text("");
		outputLine.text("");
		setReadMode(0);
	}
	
	this.keyfilter = null;
	
	function setReadMode(mode) {
		
		if (readMode !== 0 && mode !== 0)
				throw "already reading";
		
		if (mode !== readMode) {
			readMode = mode;

			if (mode === 0) {
				// read mode ends
				readBuffer = "";
				targetElement.removeClass("terminal-reading");
			}
			else {
				// read mode starts
				targetElement.addClass("terminal-reading");
				inputLine.focus();
			}
		}
	}
	
	targetElement.click(function(event) {
		inputLine.focus();
	});
	
	targetElement.keypress(function(event) {	
		if (readMode !== 0) {
			var evt = {
				suppress:false,
				chr:event.which
			};
			if (me.keyfilter) keyfilter(evt);
			if (!evt.suppress) {
				if(evt.chr === 8 && readMode === 2) {
					
					// remove last char
					var text = outputLine.text();
					if (text.length > 0)
						outputLine.text(text.substring(0, text.length-1));
					if (readBuffer.length > 0)
						readBuffer = readBuffer.substring(0, readBuffer.length-1);
					
				} else {
					
					// print char
					var isPrintable = evt.chr === 9 || evt.chr === 10 || evt.chr === 13 || evt.chr >= 32;
					var isNewline = evt.chr === 10 || evt.chr === 13;
					if (isPrintable) {
						var c = isNewline ? '\n' : String.fromCharCode(evt.chr);
						if (readMode !== 2 || !isNewline)
								readBuffer += c;
						me.write(c);
					}
				}
				if (readMode === 1 || evt.chr === 13 || evt.chr === 10) {
					var myBuffer = readBuffer;
					setReadMode(0);
					if (readCallback) readCallback(myBuffer);
				}
			}
		}		
	});
	
	targetElement.focusin(function() {
		targetElement.addClass("terminal-focused");
	});
	
	targetElement.focusout(function() {
		targetElement.removeClass("terminal-focused");
	});
	
	init();
}