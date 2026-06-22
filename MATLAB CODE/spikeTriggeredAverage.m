function  [STA,Events,STA_time] = spikeTriggeredAverage(spike_times, signal, signal_time, start_time, end_time,window,baseline)
% spike triggered average
% spike times, sct
% signal is usually roidf (dF/F0 for a targeted ROI)
% signal_time is the time base for the signal
% start_time and end_time dictate the range in minutes
% window is time before and time after spike total duration 2xwindow (plus
% one sample)
% baseline is time before spike to take baseline

% use APs to evaluate possible occult calcium signals
tolerance = 0.1; % seconds

% time range for STA output
pre = window; % seconds
post = window; % seconds

block = 0.5*window; % seconds, delay to next AP to prevent overlapping the same event
% bottom = 20; % percentile for correcting baseline
% convert to samples
dt = mean(diff(signal_time));% should be seconds
baseline_samples = round(baseline/dt);
pre_samples = round(pre / dt);
post_samples = round(post / dt);
nSamples = round(pre_samples + post_samples + 1);
%STA_time = -pre:dt:post;
STA_time = -pre_samples*dt:dt:post_samples*dt;

tstart = start_time * 60; % convert to seconds
tend = end_time * 60; % x60 seconds to convert to seconds

events_AP = spike_times; % events_AP(~isnan(events_AP)); % seconds
fluo_mean = signal; %RDS(iFile).(field)(:,iROI); % field is defined above, roi, pen, pensubdf,roidf
fluo_time = signal_time; % RDS(iFile).xdata; % seconds

nEvents = size(events_AP,1);
%Events = nan(nEvents,nSamples);
event_counter = 0;
block_counter=0;
last_time=inf;
for iEvent = 2:nEvents-1 % currently skips first and last event
    time = events_AP(iEvent);
    next_time = events_AP(iEvent+1);
    if (~isnan(time))&&(time>pre) && ( abs( time-events_AP(iEvent-1) ) > block )&&( abs( time-events_AP(iEvent+1) ) > block )
        last_time = time;
        if (time>=tstart)&&(time<=tend)
            event_counter = event_counter+1;
            tindex = find( abs(fluo_time-time)<tolerance, 1 );
            baseline = mean( fluo_mean(tindex-baseline_samples:tindex),1);
            Events(event_counter,:)=fluo_mean(tindex-pre_samples:tindex+post_samples)-baseline;
        end
    else
        block_counter=block_counter+1;

    end
end
%disp(['STA blocked ',num2str(block_counter),' events. Accepted: ',num2str(event_counter),' :: total: ',num2str(nEvents)])
if exist('Events','var')
    STA = mean(Events,1,"omitnan");
else
    Events = [];
    STA = [];
    STA_time = [];
end
end
