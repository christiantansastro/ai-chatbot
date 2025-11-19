import { expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";

export class ChatPage {
  readonly page: Page;
  readonly inputBox: Locator;
  readonly sendButton: Locator;
  readonly stopButton: Locator;
  readonly scrollToBottomButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.inputBox = page.getByTestId("multimodal-input");
    this.sendButton = page.getByTestId("send-button");
    this.stopButton = page.getByTestId("stop-button");
    this.scrollToBottomButton = page.getByTestId("scroll-to-bottom");
  }

  async createNewChat() {
    await this.page.goto("/");
  }

  async chooseModelFromSelector(modelId: string) {
    const trigger = this.page.getByTestId("model-selector");
    await trigger.click();
    const option = this.page.getByTestId(`model-selector-item-${modelId}`);
    await option.waitFor({ state: "visible" });
    await option.click();
  }

  async getSelectedModel() {
    const trigger = this.page.getByTestId("model-selector");
    const text = await trigger.innerText();
    return text.trim();
  }

  async sendUserMessage(message: string) {
    await this.inputBox.fill(message);
    await this.sendButton.click();
  }

  async sendUserMessageFromSuggestion() {
    const suggestedActions = this.page.getByTestId("suggested-actions");
    const suggestion = suggestedActions.locator("button").first();
    await suggestion.click();
  }

  async stopGeneration() {
    await this.stopButton.click();
  }

  async isGenerationComplete() {
    await this.page.waitForFunction(
      () =>
        (window as any).ai?.getCurrentStatus?.() === "ready" ||
        (window as any).ai?.getCurrentStatus?.() === "error"
    );
  }

  async hasChatIdInUrl() {
    await this.page.waitForURL(/\/chat\/[a-f0-9-]+/);
  }

  async isElementVisible(testId: string) {
    await this.page.getByTestId(testId).waitFor({ state: "visible" });
  }

  async isElementNotVisible(testId: string) {
    await this.page.getByTestId(testId).waitFor({ state: "hidden" });
  }

  async addImageAttachment() {
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "image.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGAWaE4gAAAABJRU5ErkJggg==",
        "base64"
      ),
    });
  }

  async scrollToTop() {
    await this.page.evaluate(() => window.scrollTo(0, 0));
  }

  async waitForScrollToBottom() {
    await this.page.evaluate(() =>
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
      })
    );
  }

  async sendMultipleMessages(count: number, messageFactory: (i: number) => string) {
    for (let i = 0; i < count; i++) {
      await this.sendUserMessage(messageFactory(i));
      await this.isGenerationComplete();
    }
  }

  async getRecentUserMessage(): Promise<ChatMessage> {
    const messageLocator = this.page.locator('[data-role="user"]').last();
    await messageLocator.waitFor();

    return new ChatMessage(this.page, messageLocator, "user");
  }

  async getRecentAssistantMessage(): Promise<ChatMessage> {
    const messageLocator = this.page.locator('[data-role="assistant"]').last();
    await messageLocator.waitFor();

    return new ChatMessage(this.page, messageLocator, "assistant");
  }

  async expectToastToContain(text: string) {
    await expect(this.page.getByTestId("toast")).toContainText(text);
  }
}

class ChatMessage {
  readonly page: Page;
  readonly locator: Locator;
  readonly role: "user" | "assistant";

  constructor(page: Page, locator: Locator, role: "user" | "assistant") {
    this.page = page;
    this.locator = locator;
    this.role = role;
  }

  get element(): Locator {
    return this.locator;
  }

  get content(): Promise<string> {
    return this.locator.getByTestId("message-content").innerText();
  }

  get attachments() {
    return this.locator.getByTestId("message-attachments").getByRole("button");
  }

  get reasoning(): Promise<string | null> {
    const reasoningLocator = this.locator.getByTestId("message-reasoning");
    return reasoningLocator.isVisible().then((visible) => {
      if (!visible) {
        return null;
      }
      return reasoningLocator.innerText();
    });
  }

  async edit(newText: string) {
    if (this.role !== "user") {
      throw new Error("Can only edit user messages");
    }

    const editButton = this.locator.getByTestId("message-edit");
    await editButton.click();

    const editor = this.page.getByTestId("message-editor");
    const input = editor.locator("textarea, input");
    await input.fill(newText);

    const saveButton = editor.getByTestId("message-editor-save");
    await saveButton.click();
  }

  async toggleReasoningVisibility() {
    const toggle = this.locator.getByTestId("message-reasoning-toggle");
    await toggle.click();
  }
}
