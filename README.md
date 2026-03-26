# 🧠 Cognitive Audit Pro: Real-Time UI Adaptation Engine

A specialized Shopify Theme Extension designed to analyze user interaction signals and adjust the browsing experience based on **Cognitive Load Levels**.

## 🚀 Overview
This project bridges the gap between Machine Learning and User Experience. By monitoring behavioral markers—such as **scroll velocity**, **dwell time**, and **click-path patterns**—the system identifies when a user is experiencing high cognitive strain and simplifies the UI dynamically.

## 🛠 Technical Architecture
The system follows a three-tier analysis pattern:
1. **Data Capture:** Lightweight JavaScript listeners track interaction density.
2. **Inference Engine:** Classification of load levels (Low, Medium, High) using **Random Forest** and **SVM** models.
3. **UI Adaptation:** A Liquid-based injection layer that modifies layout density and font sizes in real-time.



## ✨ Key Features
* **Live Analysis Indicator:** Real-time feedback for users on system optimization status.
* **Privacy-First Design:** All behavioral analysis is processed as anonymized signal data.
* **Adaptive Theme Blocks:** Custom Liquid blocks that respond to ML-driven metafield updates.

## 📂 Repository Structure
* `/blocks`: Contains the `cognitive-analysis.liquid` App Block.
* `/assets`: Pixel-art icons and CSS for the adaptive interface.
* `/snippets`: Reusable Liquid logic for calculating interaction thresholds.

## ⚙️ Installation
1. Clone the repository:
   ```bash
   git clone [https://github.com/your-username/cognitive-audit-pro.git](https://github.com/your-username/cognitive-audit-pro.git)
