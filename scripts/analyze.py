"""Exploratory state fixed-effects model. Not a causal inference system."""
from pathlib import Path
import numpy as np
import pandas as pd

def fixed_effects_report(root=None):
    root=Path(root or Path(__file__).resolve().parents[1])
    p=root/'data'/'processed'
    states = p/'presidential_states.csv'
    if not states.exists():
        states = root/'data'/'snapshot'/'presidential_states.csv'
    if not states.exists() or not (p/'state_unemployment.csv').exists():
        return {'status':'unavailable','message':'Import county presidential returns and state unemployment first. See README.'}
    df=pd.read_csv(states).merge(pd.read_csv(p/'state_unemployment.csv'),on=['year','state_po'],how='inner',validate='one_to_one')
    df=df.dropna(subset=['dem_margin_pp','unemployment_jan_oct_pct'])
    df = df[df.total_votes.gt(0)].copy()
    if len(df)<120 or df.state_po.nunique()<25:return {'status':'insufficient','observations':int(len(df))}
    try:
        import statsmodels.formula.api as smf
        model=smf.wls('dem_margin_pp ~ unemployment_jan_oct_pct + C(state_po) + C(year)',data=df,weights=df.total_votes).fit(cov_type='cluster',cov_kwds={'groups':df.state_po},use_t=True)
        variable='unemployment_jan_oct_pct';ci=model.conf_int().loc[variable]
        if not np.isfinite([model.params[variable],model.bse[variable],model.pvalues[variable],*ci,model.rsquared]).all():
            return {'status':'insufficient','message':'The imported sample does not support finite model estimates.'}
        return {'status':'ready','observations':int(model.nobs),'states':int(df.state_po.nunique()),'slope':float(model.params[variable]),'std_error':float(model.bse[variable]),'pvalue':float(model.pvalues[variable]),'ci_low':float(ci.iloc[0]),'ci_high':float(ci.iloc[1]),'r_squared':float(model.rsquared),'specification':'WLS state and year fixed effects, standard errors clustered by state, weighted by presidential votes','caveat':'Exploratory association only, not an estimate of what unemployment caused. Omitted variables, simultaneity and spatial/serial dependence remain.'}
    except Exception as ex:return {'status':'error','message':str(ex)}
if __name__=='__main__':
    import json
    print(json.dumps(fixed_effects_report(),indent=2))
