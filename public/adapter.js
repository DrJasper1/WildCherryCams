/*
 *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

/* eslint-env node */
'use strict';

// This is a simplified version of adapter.js for WebRTC
// For full version, see: https://github.com/webrtc/adapter

// Shimming window.RTCPeerConnection and window.RTCSessionDescription
// for better browser compatibility
(function() {
  if (typeof window === 'undefined') {
    return;
  }
  
  var RTCPeerConnection = window.RTCPeerConnection || 
                         window.webkitRTCPeerConnection || 
                         window.mozRTCPeerConnection;
                         
  var RTCSessionDescription = window.RTCSessionDescription || 
                             window.webkitRTCSessionDescription || 
                             window.mozRTCSessionDescription;
                             
  var RTCIceCandidate = window.RTCIceCandidate || 
                       window.webkitRTCIceCandidate || 
                       window.mozRTCIceCandidate;

  // Fix syntax for getUserMedia
  // Handle legacy getUserMedia approach
  if (navigator.mediaDevices === undefined) {
    navigator.mediaDevices = {};
  }
  
  if (navigator.mediaDevices.getUserMedia === undefined) {
    navigator.mediaDevices.getUserMedia = function(constraints) {
      var getUserMedia = navigator.webkitGetUserMedia || 
                        navigator.mozGetUserMedia || 
                        navigator.msGetUserMedia;
      
      if (!getUserMedia) {
        return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
      }
      
      return new Promise(function(resolve, reject) {
        getUserMedia.call(navigator, constraints, resolve, reject);
      });
    };
  }
  
  // Expose the fixed objects to the window
  window.RTCPeerConnection = RTCPeerConnection;
  window.RTCSessionDescription = RTCSessionDescription;
  window.RTCIceCandidate = RTCIceCandidate;
  
  // Safari workarounds
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) {
      var origGetSenders = window.RTCPeerConnection.prototype.getSenders;
      if (origGetSenders) {
        window.RTCPeerConnection.prototype.getSenders = function() {
          var senders = origGetSenders.apply(this, []);
          senders.forEach(function(sender) {
            if (!sender.replaceTrack) {
              sender.replaceTrack = function(track) {
                sender.track = track;
                return Promise.resolve();
              };
            }
          });
          return senders;
        };
      }
    }
  }
})();
