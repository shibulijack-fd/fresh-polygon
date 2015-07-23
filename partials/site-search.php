<input type="checkbox" style="display:none;" id="gss_pane_toggle" />
<div class="gss-wrapper">
    <input type="checkbox" style="display:none;" id="gss_results_status" />
    <div class="gss-searchpane">
        <label for="gss_pane_toggle">
            <div class="gss-hide-pane">
                <i id="gss_hide_pane" class="icon-right"></i>
            </div>
        </label>
        <input type="hidden" id="gss_start_index" value="0" />
        <input type="checkbox" style="display:none;" id="gss_search_bar_sticky_toggle" />
        <div class="gss-search-bar-wrapper">
            <div class="gss-mobile-header">
                <a href="/new-index" class="gss-fd-logo"></a>
                <button class="show-in-mobile menu-icon"></button>
                <label for="gss_pane_toggle">
                    <i class="show-in-mobile btn btn-banner btn-flat btn-light icon-gss"></i>
                </label>
            </div>
            <div class="gss-search-bar">
                <div class="gss-input-wrapper">
                    <input type="text" readonly class="gss-search-input" id="gss_search_suggestion" />
                    <input type="text" placeholder="Search Freshdesk" class="gss-search-input" id="gss_search_input" />
                    <i class="icon-gss"></i>
                </div>
                <input type="hidden" id="gss_previous_input" />
                <i class="icon-gss-enter"></i>
                <i class="icon-gss-clear"></i>
                <div class="gss-search-hints">Hit Enter to search</div>
            </div>

        </div>
        <div id="gss_landing">
            <span>
                Not sure what you are looking for? Check out some of our top features
            </span>
            <br/>
            <ul>
                <li><a href="/ticketing" target="_blank">Powerful Ticketing</a>
                </li>
                <li><a href="/multichannel-support" target="_blank">Multichannel Support</a>
                </li>
                <li><a href="/productivity" target="_blank">Productivity and Engagement</a>
                </li>
                <li><a href="/self-service" target="_blank">Self Service Portal</a>
                </li>
                <li><a href="/global-helpdesk" target="_blank">Global Customer Support</a>
                </li>
                <li><a href="/secure-helpdesk" target="_blank">Secure Helpdesk</a>
                </li>
                <li><a href="/reporting" target="_blank">Reporting and Analytics</a>
                </li>
                <li><a href="/third-party-apps" target="_blank">Integrations and Apps</a>
                </li>
            </ul>
            <br/>
            <span>
                If you'd like to get in touch with us, here's our
                &nbsp;<a target="_blank" href="/contact">Contact page</a>&nbsp;
                with all the info you need!
            </span>
        </div>
        <div class="gss-results" id="gss_results">
            <ul style="list-style: none; text-align: left;">
            </ul>
            <div class="gss-back-to-top">
                <i class="icon-gss-enter"></i>
            </div>
            <div class="gss-loading"></div>
        </div>
    </div>
</div>
<label for="gss_pane_toggle">
    <div class="gss-blur-bg"></div>
</label>