class InsightsClient {
    constructor(token, url = 'wss://mirax-connect-api-250354620143.us-central1.run.app') { // Update URL after deployment
      this.ws = new WebSocket(`${url}?token=${token}`);
      this.callbacks = [];
      this.ws.onmessage = (event) => {
        const insights = JSON.parse(event.data);
        this.callbacks.forEach((cb) => cb(insights));
      };
      this.ws.onerror = (error) => console.error('WebSocket error:', error);
    }
  
    onUpdate(callback) {
      this.callbacks.push(callback);
    }
  }
  
  export default function getInsights(token, url) {
    return new InsightsClient(token, url);
  }







// class InsightsClient {
//     constructor(token, url = 'ws://localhost:8080') { // Update URL after deployment
//       this.ws = new WebSocket(`${url}?token=${token}`);
//       this.callbacks = [];
//       this.ws.onmessage = (event) => {
//         const insights = JSON.parse(event.data);
//         this.callbacks.forEach((cb) => cb(insights));
//       };
//       this.ws.onerror = (error) => console.error('WebSocket error:', error);
//     }
  
//     onUpdate(callback) {
//       this.callbacks.push(callback);
//     }
//   }
  
//   export default function getInsights(token, url) {
//     return new InsightsClient(token, url);
//   }