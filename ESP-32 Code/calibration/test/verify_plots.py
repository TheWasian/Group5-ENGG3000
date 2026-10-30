"""Render explicitly simulated data through the real plotting functions for QA."""
import os
from pathlib import Path
import sys

root=Path(__file__).resolve().parents[1]
work=root/'.verify'
work.mkdir(exist_ok=True)
os.environ['MPLCONFIGDIR']=str(work/'mpl-config')
os.environ['MPLBACKEND']='Agg'
sys.path.insert(0,str(root/'scripts'))
import matplotlib.pyplot as plt
from multi_capture import parse_frame, plot_saved

rows=[]
for quiet in [60,100,150,200]:
    for i in range(15):
        failed=i%6==0
        status='no_ready' if failed else 'ok'
        left='nan' if failed else str(100+(i%3-1)*quiet/100)
        line=f'DATA,2,42,{len(rows)+1},0,300,{quiet},0,{left},{120+i%5},{140+i%4},{status},ok,ok,200,10,300,7000,POS,0,-1,-1,-1,0,disabled'
        row=parse_frame(line)
        row.update(actual_left_cm=100,actual_master_cm=120,actual_right_cm=140)
        rows.append(row)
for mode in ['burst','sweep','calibrate']:
    target=work/f'qa_{mode}.png'
    fig=plot_saved(rows,target,mode)
    fig.suptitle('SIMULATED QA · '+mode)
    fig.savefig(target,dpi=120,bbox_inches='tight')
    assert len(fig.axes)==2
    assert all(len(ax.get_legend().get_texts())==3 for ax in fig.axes)
    plt.close(fig)
    print('Verified plot:',target)
