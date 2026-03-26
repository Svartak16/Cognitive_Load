<div class="cognitive-audit-container" style="background-color: {{ block.settings.bg_color }}; color: {{ block.settings.text_color }};">
  <div class="audit-header">
    <span class="live-indicator">● LIVE ANALYSIS</span>
    <h3>{{ block.settings.title }}</h3>
  </div>

  <div class="analysis-grid">
    <div class="analysis-item">
      <div class="analysis-icon">⏱️</div>
      <h4>Pace Tracking</h4>
      <p>Monitoring scroll velocity and dwell patterns to detect user fatigue.</p>
    </div>

    <div class="analysis-item">
      <div class="analysis-icon">🧠</div>
      <h4>Brain-Sync ML</h4>
      <p>Using Random Forest models to classify real-time cognitive load levels.</p>
    </div>

    <div class="analysis-item">
      <div class="analysis-icon">🛡️</div>
      <h4>Privacy Shield</h4>
      <p>Data is processed locally. No personal identifiers are stored or shared.</p>
    </div>
  </div>

  {% if block.settings.show_status %}
    <div class="system-status">
      <small>Model Accuracy: <strong>94.2%</strong> | Optimization: <strong>Active</strong></small>
    </div>
  {% endif %}
</div>

<style>
  .cognitive-audit-container {
    padding: 30px;
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 15px;
    font-family: 'Inter', sans-serif;
    margin: 20px 0;
  }
  .live-indicator {
    font-size: 10px;
    letter-spacing: 1px;
    color: #ff4b4b;
    font-weight: bold;
    display: block;
    margin-bottom: 5px;
  }
  .analysis-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-top: 20px;
  }
  .analysis-item h4 {
    margin: 10px 0 5px;
    font-size: 16px;
  }
  .analysis-item p {
    font-size: 13px;
    line-height: 1.5;
    opacity: 0.8;
  }
  .analysis-icon {
    font-size: 24px;
  }
  .system-status {
    margin-top: 25px;
    padding-top: 15px;
    border-top: 1px dashed rgba(0,0,0,0.1);
    text-align: center;
  }
</style>

{% schema %}
{
  "name": "Cognitive Load Audit",
  "target": "section",
  "settings": [
    { "type": "text", "id": "title", "label": "Heading", "default": "Adaptive UX Engine" },
    { "type": "color", "id": "bg_color", "label": "Background", "default": "#ffffff" },
    { "type": "color", "id": "text_color", "label": "Text Color", "default": "#1a1a1a" },
    { "type": "checkbox", "id": "show_status", "label": "Show System Accuracy", "default": true }
  ]
}
{% endschema %}
