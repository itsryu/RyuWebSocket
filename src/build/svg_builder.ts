import { MemberPresence, UserProfileResponse } from "../types";
import { renderActivity } from "./components/activity";
import { renderHeader } from "./components/header";

export class SVGBuilder {
  static createProfileCard(options: {
    backgroundColor?: string;
    borderRadius?: string;
    data: UserProfileResponse;
    member: MemberPresence;
  }): string {
    const width = 410;
    const height = 210;

    return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}" viewBox="0 0 ${width}px ${height}">
      <foreignObject x="0" y="0" width="${width}" height="${height}">
        <div xmlns="http://www.w3.org/1999/xhtml"
          style="position:absolute;width:${width - 10}px;height:${height - 10}px;inset:0;background-color:${options.backgroundColor};color:#fff;font-family:'Century Gothic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;font-size:16px;display:flex;flex-direction:column;padding:5px;border-radius:${options.borderRadius}">
          ${renderHeader(options.data, options.member)}
          ${renderActivity(options.member)}
        </div>
      </foreignObject>
    </svg>`;
  }
}