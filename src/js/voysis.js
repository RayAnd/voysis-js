/*
 The MIT License (MIT)

 Copyright (c) 2017 Voysis

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */
(function (global, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        global.VoysisSession = factory();
    }
})(this, function () {
    'use strict';
    const DESIRED_SAMPLING_RATE = 16000;
    const STREAM_AUDIO_CALLBACK_KEY = 'AudioStreamCallback';
    const VAD_STOP_CALLBACK_KEY = 'VadStopCallback';
    const ERROR_CALLBACK_KEY_POSTFIX = '.error';
    const VAD_STOP_NOTIFICATION = 'vad_stop';
    const QUERY_COMPLETE_NOTIFICATION = 'query_complete';
    const INTERNAL_SERVER_ERROR_NOTIFICATION = 'internal_server_error';
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    var audioContext_ = null;
    var args_ = {};
    var webSocket_;
    var callbacks_;
    var currentRequestId_;
    var stopStreaming_;
    var sessionApiToken_;

    function VoysisSession(args) {
        args_ = args || {};
        checkProperty(args_, 'host');
        checkProperty(args_, 'audioProfile');
        checkProperty(args_, 'refreshToken');
        args_.debugEnabled = args_.debugEnabled || false;
        args_.streamingAudioDeadline = args_.streamingAudioDeadline || 20000;
        args_.tokenExpiryMargin = args_.tokenExpiryMargin || 30000;
        webSocket_ = null;
        callbacks_ = new Map();
        currentRequestId_ = 0;
        stopStreaming_ = false;
        sessionApiToken_ = {
            token: null,
            expiresAtEpoch: 0
        };
    }

    VoysisSession.version = '${LIBRARY_VERSION}';

    VoysisSession.prototype.finishStreamingAudio = function () {
        stopStreaming_ = true;
    };

    VoysisSession.prototype.sendAudioQuery = function (language, contextQuery) {
        return this.sendAudioQuery(language, null, contextQuery);
    };

    VoysisSession.prototype.sendAudioQuery = function (language, audioContext, contextQuery) {
        checkAudioContext(audioContext);
        var self = this;
        return checkSessionToken().then(function (sessionApiToken) {
            saveSessionApiToken(sessionApiToken);
            var queriesUrl = '/conversations/*/queries';
            return Promise.all([sendCreateAudioQueryRequest(queriesUrl, true, contextQuery), self.streamAudio()]);
        });
    };

    VoysisSession.prototype.createConversation = function (language) {
        return this.createConversation(language, null);
    };

    VoysisSession.prototype.createConversation = function (language, audioContext) {
        checkAudioContext(audioContext);
        return sendAudioRequest('POST', '/conversations', {
            'lang': language
        });
    };

    VoysisSession.prototype.getConversation = function (conversationId) {
        return sendAudioRequest('GET', '/conversations/' + conversationId, null);
    };

    VoysisSession.prototype.listConversations = function () {
        return sendAudioRequest('GET', '/conversations', null);
    };

    VoysisSession.prototype.createAudioQuery = function (conversation, contextQuery) {
        return sendCreateAudioQueryRequest(conversation._links.queries.href, false, contextQuery);
    };

    VoysisSession.prototype.streamAudio = function () {
        stopStreaming_ = false;
        return new Promise(function (resolve, reject) {
            var onSuccess = function (stream) {
                try {
                    debug('Recording at ', audioContext_.sampleRate, "Hz");
                    var source = audioContext_.createMediaStreamSource(stream);
                    var processor = audioContext_.createScriptProcessor(4096, 1, 1);
                    var stopStreaming = (function () {
                        processor.disconnect();
                        source.disconnect();
                        stream.getAudioTracks().forEach(function (track) {
                            track.stop();
                        });
                        debug('Finished Streaming');
                    });
                    source.connect(processor);
                    processor.connect(audioContext_.destination);
                    processor.onaudioprocess = function (audioProcessingEvent) {
                        // if the websocket has been closed, then stop recording and sending audio
                        if (isWebSocketOpen()) {
                            var inputArray = audioProcessingEvent.inputBuffer.getChannelData(0);
                            if (audioContext_.sampleRate != DESIRED_SAMPLING_RATE) {
                                inputArray = interpolateArray(inputArray, DESIRED_SAMPLING_RATE, audioContext_.sampleRate);
                            }
                            var outputBuffer = convertFloatsTo16BitPCM(inputArray);
                            webSocket_.send(outputBuffer);
                            if (stopStreaming_) {
                                debug('Stopping streaming...');
                                var byteArray = new Int8Array(1);
                                byteArray[0] = 4;
                                webSocket_.send(byteArray);
                                stopStreaming();
                            }
                        } else {
                            stopStreaming();
                            reject('Connection to server closed before query response sent');
                        }
                    };
                    processor.onerror = reject;
                    var timeoutId = setTimeout(function () {
                        stopStreaming();
                        reject('No response received within the timeout');
                    }, args_.streamingAudioDeadline);
                    addCallbacks(VAD_STOP_CALLBACK_KEY, function () {
                        clearTimeout(timeoutId);
                        stopStreaming();
                    });
                } catch (err) {
                    reject(err);
                }
            };
            addCallbacks(STREAM_AUDIO_CALLBACK_KEY, resolve, reject);
            debug("Getting user media");
            // Use the latest getUserMedia method if it exists
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                debug("Using standard getUserMedia");
                navigator.mediaDevices.getUserMedia({audio: true}).then(onSuccess).catch(reject);
            } else {
                // Find a getUserMedia method for the current platform
                if (navigator.getUserMedia) {
                    debug("Using navigator.getUserMedia");
                } else if (navigator.webkitGetUserMedia) {
                    debug("Using navigator.webkitGetUserMedia");
                } else if (navigator.mozGetUserMedia) {
                    debug("Using navigator.mozGetUserMedia");
                } else {
                    debug("No getUserMedia available");
                }
                var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
                getUserMedia({audio: true}, onSuccess, reject);
            }
        });
    };

    function sendCreateAudioQueryRequest(queriesUrl, skipCheckSessionToken, contextQuery) {
        return sendAudioRequest('POST', queriesUrl, {
            'queryType': 'audio',
            'audioQuery': {
                'mimeType': 'audio/wav'
            },
            'context': {"prevQuery": contextQuery} || {}

        }, skipCheckSessionToken);
    }

    function checkAudioContext(audioContext) {
        audioContext_ = audioContext || audioContext_;
        if (audioContext_ === null) {
            debug('Creating new AudioContext');
            audioContext_ = new AudioContext();
        }
        if (audioContext_.state === 'suspended') {
            audioContext_.resume();
        }
    }

    function isWebSocketOpen() {
        return (webSocket_ && webSocket_.readyState === WebSocket.OPEN);
    }

    function openWebSocket() {
        // If the websocket is already open, don't do anything
        if (isWebSocketOpen()) {
            debug("WebSocket already open");
            return new Promise(function (resolve) {
                resolve();
            });
        } else {
            return new Promise(function (resolve, reject) {
                debug('Opening WebSocket');
                webSocket_ = new WebSocket('wss://' + args_.host + '/websocketapi');
                webSocket_.onopen = function (event) {
                    debug('WebSocket onopen: ', event);
                    resolve();
                };
                webSocket_.onerror = function (event) {
                    debug('WebSocket onerror: ', event);
                    reject('There was an error communicating with the WebSocket');
                };
                webSocket_.onclose = function (event) {
                    debug('WebSocket onclose');
                    if (event.code == 1006) {
                        reject('The WebSocket closed abnormally: ' + event.reason);
                    }
                };
                webSocket_.onmessage = handleWebSocketMessage;
            });
        }
    }

    function handleWebSocketMessage(webSocketMessage) {
        var msg = JSON.parse(webSocketMessage.data);
        debug('WebSocket onmessage: ', msg);
        var callback;
        var callbackArg = msg.entity;
        if (msg.type == 'response') {
            if (msg.responseCode >= 200 && msg.responseCode < 300) {
                callback = getCallback(msg.requestId);
            } else {
                callback = getCallback(msg.requestId, true);
                callbackArg = msg.responseMessage;
            }
        } else if (msg.type == 'notification') {
            switch (msg.notificationType) {
                case VAD_STOP_NOTIFICATION:
                    callback = getCallback(VAD_STOP_CALLBACK_KEY);
                    break;
                case(QUERY_COMPLETE_NOTIFICATION):
                    callback = getCallback(STREAM_AUDIO_CALLBACK_KEY);
                    break;
                case(INTERNAL_SERVER_ERROR_NOTIFICATION):
                    callback = getCallback(STREAM_AUDIO_CALLBACK_KEY, true);
                    callbackArg = 'A Server Error Occurred';
                    break;
                default:
                    callback = getCallback(STREAM_AUDIO_CALLBACK_KEY, true);
                    callbackArg = 'Unknown Notification: ' + msg.notificationType;
            }
        }
        callFunction(callback, callbackArg);
    }

    function sendAudioRequest(method, uri, entity, skipCheckSessionToken) {
        var sendRequestFunction = function (sessionApiToken) {
            saveSessionApiToken(sessionApiToken);
            var additionalHeaders = {
                'X-Voysis-Audio-Profile': args_.audioProfile,
                'X-Voysis-Ignore-Vad': false,
                'Accept': 'application/vnd.voysisquery.v1+json'
            };
            return sendRequest(method, uri, entity, additionalHeaders, sessionApiToken_.token)
        };
        if (skipCheckSessionToken) {
            return sendRequestFunction(sessionApiToken_);
        }
        return checkSessionToken().then(sendRequestFunction);
    }

    function saveSessionApiToken(sessionApiToken) {
        sessionApiToken_ = sessionApiToken;
        sessionApiToken_.expiresAtEpoch = Date.parse(sessionApiToken.expiresAt);
    }

    function checkSessionToken() {
        if (sessionApiToken_.expiresAtEpoch < (Date.now() + args_.tokenExpiryMargin)) {
            debug("Session token has expired: ", sessionApiToken_.expiresAtEpoch, ' - ', Date.now(), " - Expiry margin is ", args_.tokenExpiryMargin);
            return sendRequest('POST', '/tokens', null, {'Accept': 'application/json'}, args_.refreshToken);
        } else {
            debug("Session token still valid");
            return new Promise(function (resolve) {
                resolve(sessionApiToken_);
            });
        }
    }

    function sendRequest(method, uri, entity, additionalHeaders, refreshToken) {
        return new Promise(function (resolve, reject) {
            var sendCallback = function () {
                currentRequestId_++;
                var msg = {
                    'type': 'request',
                    'requestId': currentRequestId_.toString(),
                    'method': method,
                    'restUri': uri,
                    'headers': {
                        'Authorization': 'Bearer ' + refreshToken
                    }
                };
                if (entity !== null) {
                    msg.entity = entity;
                }
                if (additionalHeaders !== null) {
                    msg.headers = Object.assign(msg.headers, additionalHeaders);
                }
                debug('Sending request: ', msg);
                addCallbacks(currentRequestId_.toString(), resolve, reject);
                webSocket_.send(JSON.stringify(msg));
            };
            openWebSocket().then(sendCallback, reject);
        });
    }

    function checkProperty(obj, propertyName) {
        if (obj.hasOwnProperty(propertyName)) {
            return true;
        }
        throw new Error('missing "' + propertyName + '" property');
    }

    function callFunction(func) {
        if (checkFunction(func)) {
            if (arguments.length > 1) {
                var funcArguments = Array.prototype.slice.call(arguments, 1);
                func.apply(func, funcArguments);
            } else {
                func.call(func);
            }
        }
    }

    function checkFunction(func) {
        if (func && typeof func !== 'function') {
            throw new TypeError('Not a function')
        }
        return (func != null);
    }

    function addCallbacks(callbackKey, successCallback, errorCallback) {
        if (checkFunction(successCallback)) {
            callbacks_.set(callbackKey, successCallback);
        }
        if (checkFunction(errorCallback)) {
            callbacks_.set(callbackKey + ERROR_CALLBACK_KEY_POSTFIX, errorCallback);
        }
    }

    function getCallback(callbackKey, error) {
        var key = error ? callbackKey + ERROR_CALLBACK_KEY_POSTFIX : callbackKey;
        var callback = callbacks_.get(key);
        // Remove both callbacks from the callback map to avoid memory leaks
        callbacks_.delete(callbackKey);
        callbacks_.delete(callbackKey + ERROR_CALLBACK_KEY_POSTFIX);
        return callback;
    }

    // for changing the sampling rate, data,
    function interpolateArray(data, newSampleRate, oldSampleRate) {
        var fitCount = Math.round(data.length * (newSampleRate / oldSampleRate));
        var newData = new Float32Array(fitCount);
        var springFactor = Number((data.length - 1) / (fitCount - 1));
        newData[0] = data[0]; // for new allocation
        for (var i = 1; i < fitCount - 1; i++) {
            var tmp = i * springFactor;
            var before = Number(Math.floor(tmp)).toFixed();
            var after = Number(Math.ceil(tmp)).toFixed();
            var atPoint = tmp - before;
            newData[i] = linearInterpolate(data[before], data[after], atPoint);
        }
        newData[fitCount - 1] = data[data.length - 1]; // for new allocation
        return newData;
    }

    function linearInterpolate(before, after, atPoint) {
        return before + (after - before) * atPoint;
    }

    // Converts an array with 32bit float values to
    // a 16bit little-endian signed integer array.
    function convertFloatsTo16BitPCM(floatArray) {
        var intBuffer = new ArrayBuffer(floatArray.length * 2);
        var intBufferView = new DataView(intBuffer);
        for (var i = 0; i < floatArray.length; i++) {
            var floatVal = Math.max(-1, Math.min(1, floatArray[i]));
            var intVal = floatVal < 0 ? floatVal * 0x8000 : floatVal * 0x7FFF;
            intBufferView.setInt16(i * 2, intVal, true);
        }
        return intBuffer;
    }

    function debug() {
        if (args_.debugEnabled) {
            console.log.apply(console, arguments);
        }
    }

    return VoysisSession;
});

