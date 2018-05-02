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
(function (window) {
    'use strict';

    function VoysisClient() {
        const AUDIO_PROFILE_ID = 'AudioProfileId';
        const HOST = 'Host';
        const REFRESH_TOKEN = 'RefreshToken';
        const EMAIL = 'Email';
        const USER_ID = 'UserId';
        const localStorage = window.localStorage;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        var audioContext_;
        var audioProfileId_ = localStorage.getItem(AUDIO_PROFILE_ID) || createAudioProfileId();
        var host_ = localStorage.getItem(HOST);
        var refreshToken_ = localStorage.getItem(REFRESH_TOKEN);
        var email_ = localStorage.getItem(EMAIL);
        var userId_ = localStorage.getItem(USER_ID);
        var voysisSession_;
        var statusMessageElement_;
        var statusBarElement_;
        var previousQueryContext_;
        var queryConversationId_;
        var sessionChanged_ = false;

        function createUuid() {
            function s4() {
                return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
            }

            return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
        }

        function createAudioProfileId() {
            var audioProfileId = createUuid();
            localStorage.setItem(AUDIO_PROFILE_ID, audioProfileId);
            return audioProfileId;
        }

        var voysisClient = {
            getAudioProfileId: function () {
                return audioProfileId_;
            },

            refreshAudioProfileId: function () {
                audioProfileId_ = createAudioProfileId();
                return audioProfileId_;
            },

            getAudioContext: function () {
                if (audioContext_ === null) {
                    audioContext_ = new AudioContext();
                }
                return audioContext_;
            },

            getHost: function () {
                return host_;
            },

            setHost: function (host) {
                host_ = host;
                localStorage.setItem(HOST, host);
                sessionChanged_ = true;
            },

            getPreviousQueryContext: function () {
                return previousQueryContext_;
            },

            setPreviousQueryContext: function (context) {
                previousQueryContext_ = context;
            },

            getQueryConversationId: function () {
                return queryConversationId_;
            },

            setQueryConversationId: function (conversationId) {
                queryConversationId_ = conversationId;
            },

            getRefreshToken: function () {
                return refreshToken_;
            },

            setRefreshToken: function (refreshToken) {
                refreshToken_ = refreshToken;
                localStorage.setItem(REFRESH_TOKEN, refreshToken);
                sessionChanged_ = true;
            },

            clearRefreshToken: function() {
                refreshToken_ = undefined;
                localStorage.removeItem(REFRESH_TOKEN);
                sessionChanged_ = true;
            },

            getEmail: function() {
                return email_;
            },

            setEmail: function(email) {
                email_ = email;
                localStorage.setItem(EMAIL, email);
                sessionChanged_ = true;
            },

            getUserId: function() {
                return userId_;
            },

            setUserId: function(userId) {
                userId_ = userId;
                localStorage.setItem(USER_ID, userId);
                sessionChanged_ = true;
            },

            getVoysisSession: function () {
                if (!voysisSession_ || sessionChanged_) {
                    previousQueryContext_ = null;
                    voysisSession_ = new VoysisSession({
                        refreshToken: refreshToken_,
                        host: host_,
                        audioProfileId: audioProfileId_,
                        debugEnabled: true,
                        streamingAudioDeadline: 10000,
                        autoSendDurations: true,
                        userId: userId_
                    });
                    sessionChanged_ = false;
                }
                return voysisSession_;
            },

            setStatusMessageElementId: function (statusMessageElementId, statusBarElementId) {
                statusMessageElement_ = document.getElementById(statusMessageElementId);
                statusBarElement_ = document.getElementById(statusBarElementId);
            },

            showStatus: function (alertClass, message) {
                statusMessageElement_.innerHTML = message;
                statusBarElement_.classList.remove('is-info', 'is-success', 'is-warning', 'is-danger');
                statusBarElement_.classList.add(alertClass);

            },

            info: function (message) {
                this.showStatus('is-info', message);
            },

            warn: function (message) {
                this.showStatus('is-warning', message);
            },

            error: function (message) {
                this.showStatus('is-danger', message);
            },

            finished: function (message) {
                this.showStatus('is-success', message);
            }
        };

        return voysisClient;
    }

    if (typeof(window.voysisClient) === 'undefined') {
        window.voysisClient = VoysisClient();
    }
})(window);
