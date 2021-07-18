import Vue from 'vue'
import App from './App.vue'
import router from './router'
import ls from 'fm.liveswitch';

Vue.config.productionTip = false

// Import the LiveSwitch configuration
import { applicationId, channelId, sharedSecret } from "../liveswitch_config.json";

// Import the plugin here
import { LiveSwitchPlugin } from "./liveswitch";

// generate a token that will let us connect to the server
// we use the values from the config here. In general, you should
// put this behind a service that is properly authenticated and 
// only allow access to the appropriate channels based on the
// authenticated user's permissions in your application
const token = ls.Token.generateClientRegisterToken(applicationId, null, null, null, null, [new ls.ChannelClaim(channelId)], sharedSecret);

const onLocalMediaReady = function(media){
  var home = document.getElementsByClassName('home')[0];
  home.insertBefore(media.getView(), home.firstChild)
}

const onParticipantJoin = function(record){
  var home = document.getElementsByClassName('home')[0];
  home.insertBefore(record.media.getView(), home.firstChild)
}

const onParticipantLeave = function(record){
  var home = document.getElementsByClassName('home')[0];
  home.removeChild(record.media.getView())
}

// Install the LiveSwitch plugin here
Vue.use(LiveSwitchPlugin, {
  applicationId,
  token,
  onLocalMediaReady,
  onParticipantJoin,
  onParticipantLeave
});

// normal vue stuff
new Vue({
  router,
  render: h => h(App)
}).$mount('#app')
