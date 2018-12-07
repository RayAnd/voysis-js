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
    const STREAM_AUDIO_CALLBACK_KEY = 'AudioStreamCallback';
    const VAD_STOP_CALLBACK_KEY = 'VadStopCallback';
    const ERROR_CALLBACK_KEY_POSTFIX = '.error';
    const VAD_STOP_NOTIFICATION = 'vad_stop';
    const QUERY_COMPLETE_NOTIFICATION = 'query_complete';
    const INTERNAL_SERVER_ERROR_NOTIFICATION = 'internal_server_error';
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    var audioContext_ = null;
    var args_ = {};
    var webSocket_;
    var callbacks_;
    var currentRequestId_;
    var stopStreaming_;
    var queryDurations_;
    var autoSendDurations_;
    var queryStartTime_;
    var sessionApiToken_;

    function VoysisSession(args) {
        args_ = args || {};
        checkProperty(args_, 'host');
        checkProperty(args_, 'audioProfileId');
        args_.refreshToken = args_.refreshToken || null;
        args_.debugEnabled = args_.debugEnabled || false;
        args_.streamingAudioDeadline = args_.streamingAudioDeadline || 20000;
        args_.tokenExpiryMargin = args_.tokenExpiryMargin || 30000;
        args_.audioBufferSize = args_.audioBufferSize || 4096;
        args_.ignoreVad = args_.ignoreVad || false;
        webSocket_ = null;
        callbacks_ = new Map();
        queryDurations_ = new Map();
        autoSendDurations_ = args_.autoSendDurations || false;
        queryStartTime_ = 0;
        currentRequestId_ = 0;
        stopStreaming_ = false;
        sessionApiToken_ = {
            token: null,
            expiresAtEpoch: 0
        };
    }

    VoysisSession.version = '${LIBRARY_VERSION}';

    VoysisSession.isStreamingAudioSupported = function () {
        // Look for a getUserMedia method for the current platform
        return !!(AudioContext &&
            (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia ||
                (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)));

    };

    VoysisSession.prototype.issueAppToken = function () {
        return issueAppToken();
    };

    VoysisSession.prototype.finishStreamingAudio = function () {
        stopStreaming_ = true;
        recordDuration('userStop');
    };

    VoysisSession.prototype.sendTextQuery = function (text, locale, context, conversationId) {
        var queryEntity = {
            'locale': locale,
            'queryType': 'text',
            'textQuery': {
                'text': text
            },
            'context': context || {}
        };
        if (conversationId) {
            queryEntity.conversationId = conversationId;
        }
        if (args_.userId) {
            queryEntity.userId = args_.userId;
        }
        return sendEntityRequest('POST', '/queries', queryEntity, false, true);
    };

    VoysisSession.prototype.sendAudioQuery = function (locale, context, conversationId, audioContext) {
        return this.createAudioQuery(locale, context, conversationId, audioContext).then(this.streamAudio);
    };

    VoysisSession.prototype.createAudioQuery = function (locale, context, conversationId, audioContext) {
        return checkAudioContext(audioContext).then(function () {
            queryDurations_.clear();
            return sendCreateAudioQueryRequest(locale, context, conversationId, false, audioContext_.sampleRate);
        });
    };
   
    VoysisSession.prototype.streamAudio = function (audioQueryResponse, callback) {
        stopStreaming_ = false;
        queryDurations_.clear();
        var promise = new Promise(function (resolve, reject) {
            var onSuccess = function (stream) {
                queryStartTime_ = Date.now();
                var recordingCallbackSent = false;
                var streamingStopped = false;
                try {
                    debug('Recording at ', audioContext_.sampleRate, 'Hz with a buffer size of ', args_.audioBufferSize);
                    var source = audioContext_.createMediaStreamSource(stream);
                    var processor = audioContext_.createScriptProcessor(args_.audioBufferSize, 1, 1);
                    var stopStreaming = (function () {
                        if (!streamingStopped) {
                            streamingStopped = true;
                            processor.disconnect();
                            source.disconnect();
                            stream.getAudioTracks().forEach(function (track) {
                                track.stop();
                            });
                            debug('Finished Streaming');
                        }
                    });
                    processor.onaudioprocess = function (audioProcessingEvent) {
                        // if the websocket has been closed, then stop recording and sending audio
                        if (!streamingStopped) {
                            if (isWebSocketOpen()) {
                                if (!recordingCallbackSent) {
                                    callFunction(callback, 'recording_started');
                                    recordingCallbackSent = true;
                                }
                                var inBuf = audioProcessingEvent.inputBuffer;
                                if (inBuf.length > 0) {
                                    var audioDataArray = new Float32Array(
                                        inBuf.getChannelData(0)
                                    );
                                    webSocket_.send(audioDataArray.buffer);
                                }
                                if (stopStreaming_) {
                                    debug('Stopping streaming...');
                                    var byteArray = new Int8Array(1);
                                    byteArray[0] = 4;
                                    webSocket_.send(byteArray);
                                    stopStreaming();
                                }
                            } else {
                                stopStreaming();
                                reject(new Error('Connection to server closed before query response sent'));
                            }
                        }
                    };
                    processor.onerror = function(err) {
                        reportError('AUDIO_ERROR', err, audioQueryResponse.id);
                        reject(err);
                    };
                    var timeoutId = setTimeout(function () {
                        stopStreaming();
                        reject(new Error('No response received within the timeout'));
                    }, args_.streamingAudioDeadline);
                    addCallbacks(VAD_STOP_CALLBACK_KEY, function (notificationType) {
                        clearTimeout(timeoutId);
                        stopStreaming();
                        callFunction(callback, notificationType);
                    });
                    source.connect(processor);
                    processor.connect(audioContext_.destination);
                } catch (err) {
                    reportError('OTHER', err, audioQueryResponse.id);
                    reject(err);
                }
            };
            addCallbacks(STREAM_AUDIO_CALLBACK_KEY, resolve, reject);
            debug('Getting user media');
            // Use the latest getUserMedia method if it exists
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                debug('Using standard getUserMedia');
                navigator.mediaDevices.getUserMedia({audio: true}).then(onSuccess).catch((err) => {reportError(micOrAudioReason(err), err, audioQueryResponse.id); reject(err);});
            } else {
                // Find a getUserMedia method for the current platform
                if (navigator.getUserMedia) {
                    debug('Using navigator.getUserMedia');
                } else if (navigator.webkitGetUserMedia) {
                    debug('Using navigator.webkitGetUserMedia');
                } else if (navigator.mozGetUserMedia) {
                    debug('Using navigator.mozGetUserMedia');
                } else {
                    debug('No getUserMedia available');
                    reportError('OTHER', 'NotSupportedError', audioQueryResponse.id);
                    reject(createError('Browser does not support streaming audio', 'NotSupportedError'));
                }
                var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
                var rejectHandler = function(err) {
                    reportError(micOrAudioReason(err), err, audioQueryResponse.id);
                    reject(err);
                };
                getUserMedia({audio: true}, onSuccess, rejectHandler);
            }
        });
        if (autoSendDurations_) {
            promise = promise.then(sendQueryDurations);
        }
        return promise;
    };

    VoysisSession.prototype.rateQuery = function (queryToRate, rating, description) {
        return sendFeedback(queryToRate, rating, description);
    };

    var micOrAudioReason = function(error) {
        if (error instanceof DOMException && error.name == 'NotAllowedError') {
            return 'MIC_PERMISSION';
        } else {
            return 'AUDIO_ERROR';
        }
    };

    var reportError = function(cancelReason, error, queryId) {
        try {
            var detail = error;
            if (error instanceof DOMException) {
                detail = error.name;
            }
            var payload = {'cancelReason': cancelReason, 'detail': String(detail)};
            var errorURI = '/queries/'+queryId+'/cancellation';
            sendRequest('POST', errorURI, payload, {'Accept': 'application/json'}, sessionApiToken_.token);
        } catch (ex) {
            debug('Failed to report a client error to the server.', ex);
        }
    };

    function sendQueryDurations(query) {
        debug('Durations', queryDurations_);
        sendFeedback(query, null, null, queryDurations_);
        return query;
    }

    function sendFeedback(queryForFeedback, rating, description, durations) {
        var sendFeedbackFunction = function () {
            var feedbackUri = queryForFeedback._links.self.href + '/feedback';
            debug('Sending feedback to: ', feedbackUri);
            var feedbackData = {};
            if (rating) {
                feedbackData.rating = rating;
            }
            if (description) {
                feedbackData.description = description;
            }
            if (durations) {
                // JSON doesn't support Map, so we need to convert it to an Object
                feedbackData.durations = mapToObject(durations);
            }
            var jsonFeedbackData = JSON.stringify(feedbackData);
            debug('Sending feedback: ', jsonFeedbackData);
            var headers = {
                'Accept': 'application/vnd.voysisquery.v1+json',
                'Content-Type': 'application/json'
            };

            sendRequest('PATCH', feedbackUri, feedbackData, headers, sessionApiToken_.token);
        };
        return checkSessionToken().then(sendFeedbackFunction);
    }

    function mapToObject(map) {
        var object = {};
        map.forEach(function (value, key) {
            object[key] = value;
        });
        return object;
    }

    function recordDuration(name) {
        if (queryStartTime_) {
            var duration = Date.now() - queryStartTime_;
            queryDurations_.set(name, duration);
        }
    }

    function createError(message, name) {
        var error = new Error(message);
        if (name) {
            error.name = name;
        }
        return error;
    }

    function sendCreateAudioQueryRequest(locale, context, conversationId, skipCheckSessionToken, samplingRate) {
        var queryEntity = {
            'locale': locale,
            'queryType': 'audio',
            'audioQuery': {
                'mimeType': 'audio/pcm;bits=32;rate=' + samplingRate
            },
            'context': context || {}
        };
        if (conversationId) {
            queryEntity.conversationId = conversationId;
        }
        if (args_.userId) {
            queryEntity.userId = args_.userId;
        }
        return sendEntityRequest('POST', '/queries', queryEntity, skipCheckSessionToken, args_.ignoreVad);
    }

    function checkAudioContext(audioContext) {
        audioContext_ = audioContext || audioContext_;
        if (audioContext_ == null) {
            debug('Creating new AudioContext');
            if (AudioContext) {
                audioContext_ = new AudioContext();
            } else {
                throw createError('Browser does not support streaming audio', 'NotSupportedError');
            }
        }
        if (audioContext_.state === 'suspended') {
            return audioContext_.resume();
        }
        return new Promise(function (resolve) {
            resolve();
        });
    }

    function isWebSocketOpen() {
        return (webSocket_ && webSocket_.readyState === WebSocket.OPEN);
    }

    function openWebSocket() {
        // If the websocket is already open, don't do anything
        if (isWebSocketOpen()) {
            debug('WebSocket already open');
            return Promise.resolve();
        } else {
            return new Promise(function (resolve, reject) {
                debug('Creating WebSocket');
                webSocket_ = new WebSocket('wss://' + args_.host + '/websocketapi');
                debug('Opening WebSocket', webSocket_);
                webSocket_.onopen = function (event) {
                    debug('WebSocket onopen: ', event);
                    resolve();
                };
                webSocket_.onerror = function (event) {
                    debug('WebSocket onerror: ', event);
                    reject(new Error('There was an error communicating with the WebSocket'));
                };
                webSocket_.onclose = function (event) {
                    debug('WebSocket onclose');
                    if (event.code === 1006) {
                        reject(new Error('The WebSocket closed abnormally: ' + event.reason));
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
        if (msg.type === 'response') {
            if (msg.responseCode >= 200 && msg.responseCode < 300) {
                callback = getCallback(msg.requestId);
            } else {
                callback = getCallback(msg.requestId, true);
                callbackArg = {responseCode: msg.responseCode, responseMessage: msg.responseMessage};
            }
        } else if (msg.type === 'notification') {
            switch (msg.notificationType) {
                case VAD_STOP_NOTIFICATION:
                    recordDuration('vad');
                    callback = getCallback(VAD_STOP_CALLBACK_KEY);
                    callbackArg = msg.notificationType;
                    break;
                case(QUERY_COMPLETE_NOTIFICATION):
                    recordDuration('complete');
                    callback = getCallback(STREAM_AUDIO_CALLBACK_KEY);
                    break;
                case(INTERNAL_SERVER_ERROR_NOTIFICATION):
                    callback = getCallback(STREAM_AUDIO_CALLBACK_KEY, true);
                    callbackArg = new Error('A Server Error Occurred');
                    break;
                default:
                    callback = getCallback(STREAM_AUDIO_CALLBACK_KEY, true);
                    callbackArg = new Error('Unknown Notification: ' + msg.notificationType);
            }
        }
        callFunction(callback, callbackArg);
    }

    function sendEntityRequest(method, uri, entity, skipCheckSessionToken, ignoreVad) {
        var sendRequestFunction = function () {
            var audioHeaders = {
                'X-Voysis-Audio-Profile-Id': args_.audioProfileId,
                'X-Voysis-Ignore-Vad': ignoreVad,
                'Accept': 'application/vnd.voysisquery.v1+json'
            };
            return sendRequest(method, uri, entity, audioHeaders, sessionApiToken_.token);
        };
        if (skipCheckSessionToken) {
            return sendRequestFunction(sessionApiToken_);
        }
        return checkSessionToken().then(sendRequestFunction);
    }

    function saveSessionApiToken(sessionApiToken) {
        sessionApiToken_ = sessionApiToken;
        sessionApiToken_.expiresAtEpoch = Date.parse(sessionApiToken.expiresAt);
        return sessionApiToken;
    }

    function issueAppToken() {
        if (!args_.refreshToken) {
            throw new Error('A refresh token is required to issue an application token.');
        }
        return sendRequest('POST', '/tokens', null, {'Accept': 'application/json'}, args_.refreshToken).then(saveSessionApiToken);
    }

    function checkSessionToken() {
        if (args_.refreshToken && sessionApiToken_.expiresAtEpoch < (Date.now() + args_.tokenExpiryMargin)) {
            debug('Session token has expired: ', sessionApiToken_.expiresAtEpoch, ' - ', Date.now(), ' - Expiry margin is ', args_.tokenExpiryMargin);
            return issueAppToken();
        } else {
            debug('Session token still valid');
            return Promise.resolve(sessionApiToken_);
        }
    }

    function sendRequest(method, uri, entity, additionalHeaders, authToken) {
        return new Promise(function (resolve, reject) {
            var sendCallback = function () {
                currentRequestId_++;
                var msg = {
                    'type': 'request',
                    'requestId': currentRequestId_.toString(),
                    'method': method,
                    'restUri': uri,
                    'headers': {}
                };
                if (authToken) {
                    msg.headers.Authorization = 'Bearer ' + authToken;
                }
                if (entity != null) {
                    msg.entity = entity;
                }
                if (additionalHeaders != null) {
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
            throw new TypeError('Not a function');
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

    function debug() {
        if (args_.debugEnabled) {
            /*eslint no-console: ["error", { allow: ["log"] }] */
            console.log.apply(console, arguments);
        }
    }

    return VoysisSession;
});
